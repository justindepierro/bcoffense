/**
 * Server-owned Verified Call Recognition quiz sessions.
 *
 * A browser may ask to start a released source and submit one opaque choice
 * per question. It never supplies plays, question text, answer keys, scores,
 * player identity, dates, or leaderboard rows. Those values are all selected
 * or derived here from the immutable player release and authenticated D1 user.
 */

import { readCanonicalPlayerRelease } from "./player-release.js";

export const MAX_AUTHORITATIVE_QUIZ_PAYLOAD_BYTES = 8 * 1024;
export const AUTHORITATIVE_QUIZ_SESSION_TTL_SECONDS = 20 * 60;
export const AUTHORITATIVE_QUIZ_MAX_QUESTIONS = 10;

const MAX_CHOICES_PER_QUESTION = 4;
const POINTS_PER_CORRECT_ANSWER = 10;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export class AuthoritativeQuizError extends Error {
  constructor(message, status = 400, code = "invalid_request") {
    super(message);
    this.name = "AuthoritativeQuizError";
    this.status = status;
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function requiredText(value, label, max = 240) {
  if (typeof value !== "string") {
    throw new AuthoritativeQuizError(`${label} must be text.`, 400);
  }
  const text = value.trim();
  if (!text || text.length > max || CONTROL_CHARACTERS.test(text)) {
    throw new AuthoritativeQuizError(`A valid ${label} is required.`, 400);
  }
  return text;
}

function requiredOpaqueId(value, label) {
  const id = requiredText(value, label, 128);
  if (!OPAQUE_ID_PATTERN.test(id)) {
    throw new AuthoritativeQuizError(`A valid ${label} is required.`, 400);
  }
  return id;
}

function requiredSourceId(value) {
  return requiredText(value, "sourceId", 512);
}

function requiredOrdinal(value) {
  // Ordinals are public, one-based question numbers. The D1 snapshot stores
  // zero-based ordinals only to make its composite key compact and ordered.
  if (!Number.isSafeInteger(value) || value < 1 || value > AUTHORITATIVE_QUIZ_MAX_QUESTIONS) {
    throw new AuthoritativeQuizError("ordinal must identify a quiz question.", 400);
  }
  return value;
}

function assertOnlyKeys(value, allowed) {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw new AuthoritativeQuizError("This request contains an unsupported field.", 400);
  }
}

function currentUnixSeconds(now = new Date()) {
  return Math.floor(now.getTime() / 1000);
}

function dateKeyFor(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// This intentionally mirrors the leaderboard's ISO week helper. SQLite's
// `%W` is not ISO-8601 and would split late-December / early-January rows.
export function currentAuthoritativeQuizWeekKey(now = new Date()) {
  const utcDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isoTime(value) {
  const seconds = Number(value || 0);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function numberOrZero(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function requireBatchDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new Error("Authoritative quiz storage is not configured.");
  }
  return db;
}

async function runAtomicBatch(db, statements) {
  const results = await requireBatchDatabase(db).batch(statements);
  if (!Array.isArray(results)) {
    throw new Error("Authoritative quiz transaction did not commit.");
  }
  const failed = results.find((result) => result?.success === false);
  if (failed) {
    // D1 normally rejects a failed batch, but compatible adapters can return
    // a result array with the failed statement. Preserve its database message
    // so a concurrent unique-index collision can resolve to the live session.
    throw new Error(String(failed.error || failed.message || failed.meta?.error || "Authoritative quiz transaction did not commit."));
  }
  return results;
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

/** Read one finite JSON object without using unbounded request.json(). */
export async function readAuthoritativeQuizPayload(request) {
  const advertisedLength = String(request.headers.get("content-length") || "").trim();
  if (/^\d+$/.test(advertisedLength) && Number(advertisedLength) > MAX_AUTHORITATIVE_QUIZ_PAYLOAD_BYTES) {
    throw new AuthoritativeQuizError("Quiz request is too large.", 413, "payload_too_large");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new AuthoritativeQuizError("A JSON request body is required.", 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUTHORITATIVE_QUIZ_PAYLOAD_BYTES) {
        try { await reader.cancel(); } catch (_) { /* request is already being rejected */ }
        throw new AuthoritativeQuizError("Quiz request is too large.", 413, "payload_too_large");
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof AuthoritativeQuizError) throw err;
    throw new AuthoritativeQuizError("Invalid quiz request body.", 400);
  }

  if (!size) throw new AuthoritativeQuizError("A JSON request body is required.", 400);
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) {
    throw new AuthoritativeQuizError("Invalid quiz JSON.", 400);
  }
  if (!isPlainObject(body)) throw new AuthoritativeQuizError("Quiz request must be an object.", 400);
  return body;
}

export function validateAuthoritativeQuizStartInput(input) {
  if (!isPlainObject(input)) throw new AuthoritativeQuizError("Quiz request must be an object.", 400);
  assertOnlyKeys(input, new Set(["sourceType", "sourceId", "idempotencyKey"]));
  const sourceType = requiredText(input.sourceType, "sourceType", 24).toLowerCase();
  if (sourceType !== "script" && sourceType !== "gameplan") {
    throw new AuthoritativeQuizError("sourceType must be script or gameplan.", 400);
  }
  return {
    sourceType,
    sourceId: requiredSourceId(input.sourceId),
    idempotencyKey: requiredOpaqueId(input.idempotencyKey, "idempotencyKey"),
  };
}

export function validateAuthoritativeQuizAnswerInput(input) {
  if (!isPlainObject(input)) throw new AuthoritativeQuizError("Quiz request must be an object.", 400);
  assertOnlyKeys(input, new Set(["ordinal", "choiceId"]));
  return {
    ordinal: requiredOrdinal(input.ordinal),
    choiceId: requiredOpaqueId(input.choiceId, "choiceId"),
  };
}

function sourceKey(sourceType, sourceId) {
  return `${sourceType}:${sourceId}`;
}

function sourceAvailability(release, sourceType, sourceId) {
  const settings = isPlainObject(release?.settings?.playerQuizSourceSettings)
    ? release.settings.playerQuizSourceSettings
    : {};
  const configured = settings[sourceKey(sourceType, sourceId)];
  // Old releases without a setting predate per-source controls and remain
  // available. Once a setting exists, only its explicit `available` state can
  // launch a verified scoring session.
  const state = cleanText(
    isPlainObject(configured) ? configured.state : (configured || "available"),
    32,
  ).toLowerCase();
  return state === "available";
}

function sourcePlayLabel(play) {
  return cleanText(play?.play, 240) || cleanText(play?.basePlay, 240);
}

function sourceCandidate(play, ordinal, period = "") {
  const label = sourcePlayLabel(play);
  if (!label) return null;
  return {
    key: `${label.toLocaleLowerCase()}\u001f${cleanText(play?.formation, 240).toLocaleLowerCase()}\u001f${ordinal}`,
    label,
    prompt: {
      kind: "call-recognition",
      text: "What is the call?",
      personnel: cleanText(play?.personnel, 120),
      formation: cleanText(play?.formation, 240),
      motion: cleanText(play?.motion, 240),
      period: cleanText(period, 240),
      mediaId: cleanText(play?.mediaId, 512),
    },
  };
}

function distinctCallCandidates(candidates) {
  const byLabel = new Map();
  candidates.forEach((candidate) => {
    if (!candidate) return;
    const key = candidate.label.toLocaleLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, candidate);
  });
  return [...byLabel.values()];
}

function secureIndex(max) {
  if (!Number.isSafeInteger(max) || max < 1) throw new Error("A positive random range is required.");
  const limit = 0x100000000 - (0x100000000 % max);
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % max;
}

function secureShuffle(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = secureIndex(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function createQuestionSnapshots(candidates) {
  const pool = distinctCallCandidates(candidates);
  if (pool.length < 2) {
    throw new AuthoritativeQuizError(
      "This released source needs at least two distinct calls before it can be used for Verified Call Recognition.",
      422,
      "insufficient_source_calls",
    );
  }

  return secureShuffle(pool)
    .slice(0, AUTHORITATIVE_QUIZ_MAX_QUESTIONS)
    .map((target, ordinal) => {
      const decoys = secureShuffle(pool.filter((candidate) => candidate.label !== target.label))
        .slice(0, MAX_CHOICES_PER_QUESTION - 1);
      const choices = secureShuffle([target, ...decoys]).map((candidate) => ({
        id: crypto.randomUUID(),
        label: candidate.label,
      }));
      const correct = choices.find((choice) => choice.label === target.label);
      if (!correct) throw new Error("Quiz answer choice construction failed.");
      return {
        ordinal,
        prompt: target.prompt,
        choices,
        correctChoiceId: correct.id,
      };
    });
}

function sourceFromRelease(release, input) {
  if (!release || !isPlainObject(release.release) || !cleanText(release.release.revision, 128)) {
    throw new Error("The current player release is unavailable.");
  }
  if (!sourceAvailability(release, input.sourceType, input.sourceId)) {
    throw new AuthoritativeQuizError(
      "This released source is not available for Verified Call Recognition.",
      403,
      "source_unavailable",
    );
  }

  if (input.sourceType === "script") {
    const script = Array.isArray(release.scripts)
      ? release.scripts.find((item) => cleanText(item?.id, 512) === input.sourceId)
      : null;
    if (!script || script.playerVisible !== true) {
      throw new AuthoritativeQuizError("That released script is not available.", 404, "source_not_found");
    }
    const candidates = (Array.isArray(script.plays) ? script.plays : [])
      .filter((play) => play && !play.isSeparator)
      .map((play, ordinal) => sourceCandidate(play, ordinal));
    return {
      title: cleanText(script.name, 240) || "Released Practice",
      releaseRevision: cleanText(release.release.revision, 128),
      questions: createQuestionSnapshots(candidates),
    };
  }

  const gamePlan = release.gamePlanQuiz;
  if (!gamePlan || cleanText(gamePlan.id, 512) !== input.sourceId) {
    throw new AuthoritativeQuizError("That released game plan is not available.", 404, "source_not_found");
  }
  const candidates = (Array.isArray(gamePlan.items) ? gamePlan.items : [])
    .map((item, ordinal) => sourceCandidate(item?.play, ordinal, item?.period));
  return {
    title: cleanText(gamePlan.title, 240) || "Released Game Plan",
    releaseRevision: cleanText(release.release.revision, 128),
    questions: createQuestionSnapshots(candidates),
  };
}

async function resolveNamedPlayer(db, teamId, session) {
  if (session?.role !== "player" || !session?.d1UserId) {
    throw new AuthoritativeQuizError("A named player account is required.", 403, "named_player_required");
  }
  const userId = requiredOpaqueId(session.d1UserId, "player account");
  const player = await db.prepare(
    `SELECT id AS user_id, display_name
       FROM users
      WHERE id = ? AND team_id = ? AND role = 'player' AND status = 'active'
      LIMIT 1`,
  ).bind(userId, teamId).first();
  if (!player) {
    throw new AuthoritativeQuizError("A named active player account is required.", 403, "named_player_required");
  }
  return {
    userId: String(player.user_id),
    playerName: cleanText(player.display_name, 120) || "Player",
  };
}

async function expireSessionIfNeeded(db, teamId, userId, sessionId = "", now = currentUnixSeconds()) {
  const base = `UPDATE authoritative_quiz_sessions
    SET status = 'expired', updated_at = ?
    WHERE team_id = ? AND user_id = ? AND status = 'active' AND expires_at <= ?`;
  const statement = sessionId
    ? db.prepare(`${base} AND id = ?`).bind(now, teamId, userId, now, sessionId)
    : db.prepare(base).bind(now, teamId, userId, now);
  await statement.run();
}

async function loadSessionWithMetrics(db, teamId, userId, sessionId = "", startKey = "", source = null) {
  const conditions = ["s.team_id = ?", "s.user_id = ?"];
  const binds = [teamId, userId];
  if (sessionId) {
    conditions.push("s.id = ?");
    binds.push(sessionId);
  }
  if (startKey) {
    conditions.push("s.start_key = ?");
    binds.push(startKey);
  }
  if (source) {
    conditions.push("s.source_type = ?", "s.source_id = ?");
    binds.push(source.sourceType, source.sourceId);
  }
  return db.prepare(
    `SELECT s.*,
       COALESCE(SUM(CASE WHEN q.answered_choice_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS live_answered_count,
       COALESCE(SUM(CASE WHEN q.is_correct = 1 THEN 1 ELSE 0 END), 0) AS live_correct_count
       FROM authoritative_quiz_sessions s
       LEFT JOIN authoritative_quiz_questions q ON q.session_id = s.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT 1`,
  ).bind(...binds).first();
}

async function loadActiveSessionWithMetrics(db, teamId, userId) {
  return db.prepare(
    `SELECT s.*,
       COALESCE(SUM(CASE WHEN q.answered_choice_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS live_answered_count,
       COALESCE(SUM(CASE WHEN q.is_correct = 1 THEN 1 ELSE 0 END), 0) AS live_correct_count
       FROM authoritative_quiz_sessions s
       LEFT JOIN authoritative_quiz_questions q ON q.session_id = s.id
      WHERE s.team_id = ? AND s.user_id = ? AND s.status = 'active'
      GROUP BY s.id
      ORDER BY s.started_at DESC, s.id DESC
      LIMIT 1`,
  ).bind(teamId, userId).first();
}

function parseQuestionJson(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (!isPlainObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch (_) {
    throw new Error(`Stored quiz ${label} is invalid.`);
  }
}

function publicQuestion(row) {
  if (!row) return null;
  const prompt = parseQuestionJson(row.prompt_json, "prompt");
  let choices;
  try {
    choices = JSON.parse(row.choices_json);
  } catch (_) {
    throw new Error("Stored quiz choices are invalid.");
  }
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > MAX_CHOICES_PER_QUESTION) {
    throw new Error("Stored quiz choices are invalid.");
  }
  const sanitizedChoices = choices.map((choice) => {
    if (!isPlainObject(choice) || !OPAQUE_ID_PATTERN.test(String(choice.id || "")) || !cleanText(choice.label, 240)) {
      throw new Error("Stored quiz choices are invalid.");
    }
    return { id: String(choice.id), label: cleanText(choice.label, 240) };
  });
  return {
    ordinal: numberOrZero(row.ordinal) + 1,
    prompt,
    choices: sanitizedChoices,
  };
}

async function loadNextQuestion(db, sessionId) {
  const row = await db.prepare(
    `SELECT ordinal, prompt_json, choices_json
       FROM authoritative_quiz_questions
      WHERE session_id = ? AND answered_choice_id IS NULL
      ORDER BY ordinal ASC
      LIMIT 1`,
  ).bind(sessionId).first();
  return publicQuestion(row);
}

function sessionMetrics(row) {
  const questionCount = numberOrZero(row?.question_count);
  const answeredCount = row?.status === "completed"
    ? numberOrZero(row?.answered_count)
    : numberOrZero(row?.live_answered_count);
  const correctCount = row?.status === "completed"
    ? numberOrZero(row?.correct_count)
    : numberOrZero(row?.live_correct_count);
  return {
    questionCount,
    answeredCount,
    correctCount,
    wrongCount: Math.max(0, answeredCount - correctCount),
  };
}

function publicSession(row) {
  if (!row) return null;
  const metrics = sessionMetrics(row);
  const complete = row.status === "completed";
  const session = {
    id: String(row.id),
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    sourceTitle: cleanText(row.source_title, 240),
    title: cleanText(row.source_title, 240),
    releaseRevision: cleanText(row.release_revision, 128),
    status: String(row.status),
    questionCount: metrics.questionCount,
    total: metrics.questionCount,
    // Progress is safe to show while a run is active. Correctness, score, and
    // percent remain server-private until the single completion transition.
    answeredCount: metrics.answeredCount,
    expiresAt: isoTime(row.expires_at),
    startedAt: isoTime(row.started_at),
    completedAt: complete ? isoTime(row.completed_at) : null,
  };
  if (complete) {
    session.result = {
      attemptId: cleanText(row.attempt_id, 128),
      score: numberOrZero(row.score),
      totalPoints: numberOrZero(row.total_points),
      answered: metrics.answeredCount,
      correct: metrics.correctCount,
      wrong: numberOrZero(row.wrong_count),
      totalQuestions: metrics.questionCount,
      percent: numberOrZero(row.percent),
      weekKey: cleanText(row.week_key, 20),
      dateKey: cleanText(row.date_key, 20),
    };
  }
  return session;
}

async function publicSessionResponse(db, row, extra = {}) {
  const session = publicSession(row);
  if (!session) throw new AuthoritativeQuizError("Quiz session not found.", 404, "not_found");
  const question = row.status === "active" ? await loadNextQuestion(db, row.id) : null;
  const completeReady = row.status === "active" && !question && session.answeredCount === session.questionCount;
  return {
    session,
    question,
    nextQuestion: question,
    completeReady,
    isComplete: row.status === "completed",
    ...extra,
  };
}

async function loadOwnedSession(db, teamId, userId, sessionId, now = currentUnixSeconds()) {
  await expireSessionIfNeeded(db, teamId, userId, sessionId, now);
  const row = await loadSessionWithMetrics(db, teamId, userId, sessionId);
  if (!row) throw new AuthoritativeQuizError("Quiz session not found.", 404, "not_found");
  return row;
}

/**
 * Start or resume one server-owned session. `input` is the already-validated
 * public shape: only source identity and idempotency key are accepted.
 */
export async function startAuthoritativeQuizSession(env, teamId, session, input) {
  const db = requireBatchDatabase(env?.DB);
  const normalized = validateAuthoritativeQuizStartInput(input);
  const player = await resolveNamedPlayer(db, teamId, session);
  const now = new Date();
  const timestamp = currentUnixSeconds(now);

  await expireSessionIfNeeded(db, teamId, player.userId, "", timestamp);

  const idempotent = await loadSessionWithMetrics(db, teamId, player.userId, "", normalized.idempotencyKey);
  if (idempotent) {
    if (idempotent.source_type !== normalized.sourceType || idempotent.source_id !== normalized.sourceId) {
      throw new AuthoritativeQuizError("This idempotency key belongs to a different quiz source.", 409, "idempotency_conflict");
    }
    return publicSessionResponse(db, idempotent, { resumed: true });
  }

  const active = await loadActiveSessionWithMetrics(db, teamId, player.userId);
  if (active && active.status === "active") {
    if (active.source_type === normalized.sourceType && active.source_id === normalized.sourceId) {
      return publicSessionResponse(db, active, { resumed: true });
    }
    throw new AuthoritativeQuizError(
      "Finish or let the current verified quiz expire before starting a different source.",
      409,
      "active_session_exists",
    );
  }

  let release;
  try {
    release = await readCanonicalPlayerRelease(env, teamId);
  } catch (err) {
    console.error(JSON.stringify({ event: "authoritative_quiz_release_read_failed", message: String(err?.message || err) }));
    throw new Error("The verified quiz source is temporarily unavailable.");
  }
  const source = sourceFromRelease(release, normalized);
  const sessionId = crypto.randomUUID();
  const expiresAt = timestamp + AUTHORITATIVE_QUIZ_SESSION_TTL_SECONDS;
  const sessionInsert = db.prepare(
    `INSERT INTO authoritative_quiz_sessions (
       id, team_id, user_id, player_name, source_type, source_id, source_title,
       release_revision, start_key, status, question_count, started_at, expires_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
  ).bind(
    sessionId, teamId, player.userId, player.playerName, normalized.sourceType, normalized.sourceId,
    source.title, source.releaseRevision, normalized.idempotencyKey, source.questions.length,
    timestamp, expiresAt, timestamp,
  );
  const questionStatements = source.questions.map((question) => db.prepare(
    `INSERT INTO authoritative_quiz_questions (
       session_id, ordinal, prompt_json, choices_json, correct_choice_id
     ) VALUES (?, ?, ?, ?, ?)`,
  ).bind(
    sessionId, question.ordinal, JSON.stringify(question.prompt), JSON.stringify(question.choices), question.correctChoiceId,
  ));

  try {
    await runAtomicBatch(db, [sessionInsert, ...questionStatements]);
  } catch (err) {
    // Always re-read durable state after a failed start batch. A D1 adapter
    // may report a unique-index collision as a failed result array rather than
    // throwing the original SQLite error. If another request created the
    // session, converge on that committed state; otherwise surface the real
    // failure without leaving a partial snapshot.
    const racedIdempotent = await loadSessionWithMetrics(db, teamId, player.userId, "", normalized.idempotencyKey);
    if (racedIdempotent) {
      if (racedIdempotent.source_type !== normalized.sourceType || racedIdempotent.source_id !== normalized.sourceId) {
        throw new AuthoritativeQuizError("This idempotency key belongs to a different quiz source.", 409, "idempotency_conflict");
      }
      return publicSessionResponse(db, racedIdempotent, { resumed: true });
    }
    const racedActive = await loadActiveSessionWithMetrics(db, teamId, player.userId);
    if (racedActive?.status === "active") {
      if (racedActive.source_type === normalized.sourceType && racedActive.source_id === normalized.sourceId) {
        return publicSessionResponse(db, racedActive, { resumed: true });
      }
      throw new AuthoritativeQuizError(
        "Finish or let the current verified quiz expire before starting a different source.",
        409,
        "active_session_exists",
      );
    }
    throw err;
  }

  const created = await loadSessionWithMetrics(db, teamId, player.userId, sessionId);
  return publicSessionResponse(db, created, { resumed: false });
}

export async function getAuthoritativeQuizSession(db, teamId, session, sessionId) {
  requireBatchDatabase(db);
  const player = await resolveNamedPlayer(db, teamId, session);
  const id = requiredOpaqueId(sessionId, "session ID");
  const row = await loadOwnedSession(db, teamId, player.userId, id);
  return publicSessionResponse(db, row);
}

export async function answerAuthoritativeQuizSession(db, teamId, session, sessionId, input) {
  requireBatchDatabase(db);
  const player = await resolveNamedPlayer(db, teamId, session);
  const id = requiredOpaqueId(sessionId, "session ID");
  const answer = validateAuthoritativeQuizAnswerInput(input);
  const databaseOrdinal = answer.ordinal - 1;
  const now = currentUnixSeconds();
  const sessionRow = await loadOwnedSession(db, teamId, player.userId, id, now);
  if (sessionRow.status === "expired") {
    throw new AuthoritativeQuizError("This quiz session has expired. Start a new verified quiz to continue.", 409, "expired");
  }

  const question = await db.prepare(
    `SELECT ordinal, choices_json, answered_choice_id
       FROM authoritative_quiz_questions
      WHERE session_id = ? AND ordinal = ?
      LIMIT 1`,
  ).bind(id, databaseOrdinal).first();
  if (!question) throw new AuthoritativeQuizError("Quiz question not found.", 404, "question_not_found");
  let storedChoices;
  try { storedChoices = JSON.parse(question.choices_json); } catch (_) { throw new Error("Stored quiz choices are invalid."); }
  if (!Array.isArray(storedChoices) || !storedChoices.some((choice) => choice?.id === answer.choiceId)) {
    throw new AuthoritativeQuizError("choiceId is not valid for this question.", 400);
  }
  // A lost mobile response can retry the same first-write even after the UI
  // has advanced. Preserve idempotency before enforcing the current ordinal.
  if (question.answered_choice_id) {
    if (question.answered_choice_id !== answer.choiceId) {
      throw new AuthoritativeQuizError("This question has already been answered with a different choice.", 409, "answer_conflict");
    }
    const refreshed = await loadOwnedSession(db, teamId, player.userId, id, now);
    const state = await publicSessionResponse(db, refreshed);
    return {
      ...state,
      answer: { ordinal: answer.ordinal, choiceId: answer.choiceId, recorded: true, idempotent: true },
    };
  }

  const expected = await db.prepare(
    `SELECT ordinal FROM authoritative_quiz_questions
      WHERE session_id = ? AND answered_choice_id IS NULL
      ORDER BY ordinal ASC
      LIMIT 1`,
  ).bind(id).first();
  if (!expected) {
    if (sessionRow.status === "completed") return publicSessionResponse(db, sessionRow);
    throw new AuthoritativeQuizError("All questions are answered. Complete the quiz to record it.", 409, "complete_ready");
  }
  if (Number(expected.ordinal) !== databaseOrdinal) {
    throw new AuthoritativeQuizError("Answer the current quiz question before moving ahead.", 409, "out_of_order");
  }

  const update = await db.prepare(
    `UPDATE authoritative_quiz_questions
        SET answered_choice_id = ?, answered_at = ?,
            is_correct = CASE WHEN correct_choice_id = ? THEN 1 ELSE 0 END
      WHERE session_id = ? AND ordinal = ? AND answered_choice_id IS NULL
        AND EXISTS (
          SELECT 1 FROM authoritative_quiz_sessions s
           WHERE s.id = ? AND s.team_id = ? AND s.user_id = ?
             AND s.status = 'active' AND s.expires_at > ?
        )`,
  ).bind(answer.choiceId, now, answer.choiceId, id, databaseOrdinal, id, teamId, player.userId, now).run();

  let answerRow;
  let idempotent = false;
  if (changes(update) === 1) {
    answerRow = await db.prepare(
      `SELECT answered_choice_id FROM authoritative_quiz_questions
        WHERE session_id = ? AND ordinal = ? LIMIT 1`,
    ).bind(id, databaseOrdinal).first();
  } else {
    const latestSession = await loadOwnedSession(db, teamId, player.userId, id, now);
    if (latestSession.status === "expired") {
      throw new AuthoritativeQuizError("This quiz session has expired. Start a new verified quiz to continue.", 409, "expired");
    }
    answerRow = await db.prepare(
      `SELECT answered_choice_id FROM authoritative_quiz_questions
        WHERE session_id = ? AND ordinal = ? LIMIT 1`,
    ).bind(id, databaseOrdinal).first();
    if (!answerRow?.answered_choice_id) {
      throw new AuthoritativeQuizError("Quiz answer could not be recorded. Please retry.", 409, "answer_conflict");
    }
    if (answerRow.answered_choice_id !== answer.choiceId) {
      throw new AuthoritativeQuizError("This question has already been answered with a different choice.", 409, "answer_conflict");
    }
    idempotent = true;
  }

  const refreshed = await loadOwnedSession(db, teamId, player.userId, id, now);
  const state = await publicSessionResponse(db, refreshed);
  return {
    ...state,
    answer: {
      ordinal: answer.ordinal,
      choiceId: answer.choiceId,
      recorded: true,
      idempotent,
    },
  };
}

export async function completeAuthoritativeQuizSession(db, teamId, session, sessionId) {
  requireBatchDatabase(db);
  const player = await resolveNamedPlayer(db, teamId, session);
  const id = requiredOpaqueId(sessionId, "session ID");
  const nowDate = new Date();
  const now = currentUnixSeconds(nowDate);
  const sessionRow = await loadOwnedSession(db, teamId, player.userId, id, now);
  if (sessionRow.status === "completed") return publicSessionResponse(db, sessionRow);
  if (sessionRow.status === "expired") {
    throw new AuthoritativeQuizError("This quiz session has expired. Start a new verified quiz to continue.", 409, "expired");
  }

  const counts = await db.prepare(
    `SELECT COUNT(*) AS total_questions,
       COALESCE(SUM(CASE WHEN answered_choice_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS answered,
       COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct
       FROM authoritative_quiz_questions
      WHERE session_id = ?`,
  ).bind(id).first();
  const totalQuestions = numberOrZero(counts?.total_questions);
  const answered = numberOrZero(counts?.answered);
  const correct = numberOrZero(counts?.correct);
  if (!totalQuestions || totalQuestions !== numberOrZero(sessionRow.question_count) || answered !== totalQuestions) {
    throw new AuthoritativeQuizError("Answer every question before completing this quiz.", 409, "incomplete");
  }
  const wrong = Math.max(0, answered - correct);
  const score = correct * POINTS_PER_CORRECT_ANSWER;
  const percent = answered ? Math.round((correct / answered) * 100) : 0;
  const attemptId = crypto.randomUUID();
  const dateKey = dateKeyFor(nowDate);
  const weekKey = currentAuthoritativeQuizWeekKey(nowDate);

  // The conditional transition and attempt insert share one D1 transaction.
  // A racing completion sees the committed row, then the unique session index
  // makes its insert a no-op; both callers receive the one stored result.
  const claim = db.prepare(
    `UPDATE authoritative_quiz_sessions
        SET status = 'completed', score = ?, total_points = ?, answered_count = ?,
            correct_count = ?, wrong_count = ?, percent = ?, date_key = ?, week_key = ?,
            attempt_id = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND team_id = ? AND user_id = ?
        AND status = 'active' AND expires_at > ? AND question_count = ?
        AND (SELECT COUNT(*) FROM authoritative_quiz_questions
              WHERE session_id = ? AND answered_choice_id IS NOT NULL) = ?`,
  ).bind(
    score, score, answered, correct, wrong, percent, dateKey, weekKey,
    attemptId, now, now, id, teamId, player.userId, now, totalQuestions, id, totalQuestions,
  );
  const attemptInsert = db.prepare(
    `INSERT INTO player_quiz_attempts (
       id, team_id, user_id, player_name, source_type, source_id, title,
       position_key, position_label, score, bonus_points, total_points,
       answered, correct, wrong, total_questions, remaining, percent,
       badge, best_streak, question_breakdown, review, completed,
       date_key, week_key, completed_at, client_updated_at, updated_at,
       score_origin, authoritative_session_id
     )
     SELECT
       s.attempt_id, s.team_id, s.user_id, s.player_name, s.source_type, s.source_id, s.source_title,
       '', '', s.score, 0, s.total_points,
       s.answered_count, s.correct_count, s.wrong_count, s.question_count, 0, s.percent,
       'Verified', 0, NULL, NULL, 1,
       s.date_key, s.week_key, s.completed_at, s.completed_at, ?,
       'server', s.id
       FROM authoritative_quiz_sessions s
      WHERE s.id = ? AND s.team_id = ? AND s.user_id = ?
        AND s.status = 'completed' AND s.attempt_id IS NOT NULL
     ON CONFLICT DO NOTHING`,
  ).bind(now, id, teamId, player.userId);
  const results = await runAtomicBatch(db, [claim, attemptInsert]);
  const claimed = changes(results[0]) === 1;
  const refreshed = await loadOwnedSession(db, teamId, player.userId, id, now);
  if (refreshed.status === "expired") {
    throw new AuthoritativeQuizError("This quiz session has expired. Start a new verified quiz to continue.", 409, "expired");
  }
  if (refreshed.status !== "completed") {
    throw new AuthoritativeQuizError("Quiz completion could not be recorded. Please retry.", 409, "completion_conflict");
  }
  return publicSessionResponse(db, refreshed, { idempotent: !claimed });
}
