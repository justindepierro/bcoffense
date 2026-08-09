import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { createSessionCookie } = await import("../functions/_lib/auth.js");
const { onRequestPost: startSession } = await import("../functions/api/quiz-sessions/index.js");
const { onRequestGet: getSession } = await import("../functions/api/quiz-sessions/[sessionId].js");
const { onRequestPost: answerSession } = await import("../functions/api/quiz-sessions/[sessionId]/answers.js");
const { onRequestPost: completeSession } = await import("../functions/api/quiz-sessions/[sessionId]/complete.js");
const { onRequestPost: syncLeaderboard } = await import("../functions/api/leaderboard/sync.js");
const { onRequestGet: leaderboardSummary } = await import("../functions/api/leaderboard/summary.js");

const root = fileURLToPath(new URL("..", import.meta.url));
const migration = await readFile(new URL("../migrations/0028_authoritative_quiz_sessions.sql", import.meta.url), "utf8");

assert.match(migration, /score_origin TEXT NOT NULL DEFAULT 'legacy_client'/, "0028 preserves legacy audit rows as untrusted");
assert.match(migration, /reward_origin TEXT NOT NULL DEFAULT 'legacy_client'/, "0028 preserves historic rewards as untrusted");
assert.match(migration, /sticker_origin TEXT NOT NULL DEFAULT 'legacy_client'/, "0028 preserves historic stickers as untrusted");
assert.match(migration, /authoritative_quiz_sessions/, "0028 creates a durable authoritative session ledger");
assert.match(migration, /idx_authoritative_quiz_sessions_active_player/, "0028 enforces one active session per player");

function makeD1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE teams (id TEXT PRIMARY KEY, created_at INTEGER);
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      display_name TEXT,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      team_id TEXT NOT NULL
    );
    CREATE TABLE staff_access (user_id TEXT NOT NULL, team_id TEXT NOT NULL, permissions_json TEXT);
    CREATE TABLE account_session_state (user_id TEXT PRIMARY KEY, invalid_before INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE account_session_epochs (user_id TEXT PRIMARY KEY, session_epoch TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0);

    CREATE TABLE team_workspace_revisions (
      team_id TEXT NOT NULL, revision TEXT NOT NULL, r2_key TEXT NOT NULL, checksum TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, content_type TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT,
      PRIMARY KEY (team_id, revision)
    );
    CREATE TABLE team_player_release_revisions (
      team_id TEXT NOT NULL, revision TEXT NOT NULL, r2_key TEXT NOT NULL, checksum TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, content_type TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT,
      PRIMARY KEY (team_id, revision)
    );
    CREATE TABLE team_player_release_current (
      team_id TEXT PRIMARY KEY, player_release_revision TEXT NOT NULL, workspace_revision TEXT NOT NULL,
      updated_at INTEGER NOT NULL, updated_by TEXT
    );

    CREATE TABLE player_quiz_attempts (
      id TEXT NOT NULL, team_id TEXT NOT NULL REFERENCES teams(id), user_id TEXT REFERENCES users(id), player_name TEXT NOT NULL,
      source_type TEXT, source_id TEXT, title TEXT, position_key TEXT, position_label TEXT,
      score INTEGER NOT NULL DEFAULT 0, bonus_points INTEGER NOT NULL DEFAULT 0, total_points INTEGER NOT NULL DEFAULT 0,
      answered INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0, remaining INTEGER NOT NULL DEFAULT 0, percent INTEGER NOT NULL DEFAULT 0,
      badge TEXT, best_streak INTEGER NOT NULL DEFAULT 0, question_breakdown TEXT, review TEXT,
      completed INTEGER NOT NULL DEFAULT 1, date_key TEXT, week_key TEXT, completed_at INTEGER,
      client_updated_at INTEGER, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
      PRIMARY KEY (team_id, id)
    );
    CREATE TABLE player_reward_events (
      id TEXT NOT NULL, team_id TEXT NOT NULL, user_id TEXT, player_name TEXT NOT NULL,
      type TEXT, label TEXT, points INTEGER NOT NULL DEFAULT 0, note TEXT, awarded_by TEXT,
      source TEXT, source_post_id TEXT, source_play_id TEXT, status TEXT NOT NULL DEFAULT 'approved',
      date_key TEXT, week_key TEXT, created_at_client INTEGER, approved_at INTEGER, approved_by TEXT,
      updated_at INTEGER NOT NULL, PRIMARY KEY (team_id, id)
    );
    CREATE TABLE player_helmet_stickers (
      id TEXT NOT NULL, team_id TEXT NOT NULL, user_id TEXT, player_name TEXT NOT NULL,
      sticker_key TEXT, label TEXT, icon TEXT, color TEXT, description TEXT, note TEXT,
      awarded_by TEXT, context TEXT, date_key TEXT, week_key TEXT, created_at_client INTEGER,
      updated_at INTEGER NOT NULL, PRIMARY KEY (team_id, id)
    );
  `);
  raw.exec(migration);

  function run(statement, values) {
    const result = statement.run(...values);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }

  return {
    raw,
    prepare(sql) {
      return {
        bind(...values) {
          const statement = raw.prepare(sql);
          return {
            first: async () => statement.get(...values) || null,
            all: async () => ({ success: true, results: statement.all(...values) }),
            run: async () => run(statement, values),
            __run: () => run(statement, values),
          };
        },
      };
    },
    async batch(statements) {
      raw.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.__run());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function makeRelease(teamId = "team-a") {
  const play = (id, label, formation) => ({
    id,
    play: label,
    personnel: "10",
    formation,
    motion: "Jet",
    mediaId: `play:${id}`,
  });
  return {
    schema: "bcoffense.player-release/v1",
    release: { teamId, revision: "released-revision-a" },
    media: { diagramMediaIds: [], diagrams: [], clipSigs: [] },
    scripts: [
      {
        id: "script-a", name: "Install One", playerVisible: true,
        plays: [play("buck", "Buck Sweep", "Doubles"), play("verts", "Four Verts", "Trips")],
      },
      {
        id: "script-locked", name: "Locked Install", playerVisible: true,
        plays: [play("locked-a", "Power", "Tight"), play("locked-b", "Counter", "Wing")],
      },
      {
        id: "script-expire", name: "Expired Install", playerVisible: true,
        plays: [play("expire-a", "Mesh", "Empty"), play("expire-b", "Smash", "Bunch")],
      },
      {
        id: "script-fail", name: "Atomic Failure", playerVisible: true,
        plays: [play("fail-a", "Zone", "Spread"), play("fail-b", "Boot", "Pistol")],
      },
    ],
    gamePlanQuiz: {
      id: "gameplan-a", title: "Opponent A", items: [
        { period: "Openers", play: play("gp-a", "Flood", "Trips") },
        { period: "Red Zone", play: play("gp-b", "Drive", "Bunch") },
      ],
    },
    settings: {
      playerQuizSourceSettings: {
        "script:script-a": { state: "available" },
        "script:script-locked": { state: "locked" },
        "script:script-expire": { state: "available" },
        "script:script-fail": { state: "available" },
        "gameplan:gameplan-a": { state: "available" },
      },
    },
  };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function publishRelease(db, clips, teamId, release) {
  const text = JSON.stringify(release);
  const checksum = await sha256Hex(text);
  const workspaceRevision = "a".repeat(64);
  const releaseRevision = "b".repeat(64);
  const r2Key = `media/teams/${teamId}/player-release/${releaseRevision}.json`;
  clips.set(r2Key, text);
  db.raw.prepare("INSERT OR REPLACE INTO team_workspace_revisions (team_id, revision, r2_key, checksum, size_bytes, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(teamId, workspaceRevision, `workspace/${teamId}`, "workspace-checksum", 1, "application/json", 1);
  db.raw.prepare("INSERT OR REPLACE INTO team_player_release_revisions (team_id, revision, r2_key, checksum, size_bytes, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(teamId, releaseRevision, r2Key, checksum, text.length, "application/json", 1);
  db.raw.prepare("INSERT OR REPLACE INTO team_player_release_current (team_id, player_release_revision, workspace_revision, updated_at) VALUES (?, ?, ?, ?)")
    .run(teamId, releaseRevision, workspaceRevision, 1);
}

function request(path, cookie = "", body, opts = {}) {
  const headers = { "X-BC-Auth-Mode": "json" };
  if (cookie) headers.Cookie = cookie.split(";")[0];
  if (opts.method !== "GET") headers["Content-Type"] = "application/json";
  return new Request(`https://bcoffense.example${path}`, {
    method: opts.method || "POST",
    headers,
    body: opts.method === "GET" ? undefined : (opts.rawBody ?? JSON.stringify(body)),
  });
}

function startContext(cookie, body, env) {
  return { request: request("/api/quiz-sessions", cookie, body), env };
}

function answerContext(cookie, sessionId, body, env) {
  return {
    request: request(`/api/quiz-sessions/${sessionId}/answers`, cookie, body),
    env,
    params: { sessionId },
  };
}

function completeContext(cookie, sessionId, body, env) {
  return {
    request: request(`/api/quiz-sessions/${sessionId}/complete`, cookie, body),
    env,
    params: { sessionId },
  };
}

const db = makeD1();
db.raw.exec("INSERT INTO teams (id, created_at) VALUES ('team-a', 1), ('team-b', 1)");
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, 'player', 'active', ?)")
  .run("player-one", "one@example.com", "Player One", "team-a");
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, 'player', 'active', ?)")
  .run("player-two", "two@example.com", "Player Two", "team-b");

const clips = new Map();
await publishRelease(db, clips, "team-a", makeRelease());
const env = {
  DB: db,
  CLIPS: { get: async (key) => clips.has(key) ? { text: async () => clips.get(key) } : null },
  AUTH_SESSION_SECRET: "authoritative-quiz-runtime-test-secret",
  AUTH_PRIMARY_TEAM_ID: "team-a",
};
const playerOneCookie = await createSessionCookie({
  username: "one@example.com", role: "player", label: "Forged Player", d1: true, d1_user_id: "player-one",
}, env);
const playerTwoCookie = await createSessionCookie({
  username: "two@example.com", role: "player", label: "Player Two", d1: true, d1_user_id: "player-two",
}, env);
const staticPlayerCookie = await createSessionCookie({ username: "player", role: "player", label: "Shared Player" }, env);

const unauthenticated = await startSession({ request: request("/api/quiz-sessions", "", { sourceType: "script", sourceId: "script-a", idempotencyKey: "start-unauth" }), env });
assert.equal(unauthenticated.status, 401, "session start requires authentication");
const staticPlayer = await startSession(startContext(staticPlayerCookie, { sourceType: "script", sourceId: "script-a", idempotencyKey: "start-static" }, env));
assert.equal(staticPlayer.status, 403, "shared/static player credentials cannot earn verified scores");
const oversized = await startSession({
  request: request("/api/quiz-sessions", playerOneCookie, null, { rawBody: `{"sourceType":"script","padding":"${"x".repeat(9000)}"}` }),
  env,
});
assert.equal(oversized.status, 413, "start body parsing has a finite request cap");
const locked = await startSession(startContext(playerOneCookie, { sourceType: "script", sourceId: "script-locked", idempotencyKey: "start-locked" }, env));
assert.equal(locked.status, 403, "release source availability is enforced server-side");

const firstStartResponse = await startSession(startContext(playerOneCookie, {
  sourceType: "script", sourceId: "script-a", idempotencyKey: "start-script-a",
}, env));
assert.equal(firstStartResponse.status, 201, "a named player can start an available released script");
const firstStart = await firstStartResponse.json();
assert.equal(firstStart.ok, true);
assert.equal(firstStart.resumed, false);
assert.equal(firstStart.session.status, "active");
assert.equal(firstStart.session.title, "Install One");
assert.equal(firstStart.session.total, 2);
assert.match(firstStart.session.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(firstStart.question.ordinal, 1, "public question ordinals are one-based");
assert.deepEqual(
  Object.keys(firstStart.question.prompt).sort(),
  ["formation", "kind", "mediaId", "motion", "period", "personnel", "text"],
  "the public prompt contains only sanitized study context",
);
const publicStartJson = JSON.stringify(firstStart);
assert.equal(/correct_choice_id|correctChoiceId|isCorrect|correctCount|wrongCount|score|percent|result/.test(publicStartJson), false, "active start never leaks answer keys, correctness, or score state");
const sessionId = firstStart.session.id;

const ownActiveRead = await getSession({
  request: request(`/api/quiz-sessions/${sessionId}`, playerOneCookie, undefined, { method: "GET" }),
  env,
  params: { sessionId },
});
assert.equal(ownActiveRead.status, 200, "the owner can resume an active session");
assert.equal(/correct_choice_id|correctChoiceId|isCorrect|correctCount|wrongCount|score|percent|result/.test(JSON.stringify(await ownActiveRead.json())), false, "active GET has no answer or score oracle");

const crossTeam = await getSession({
  request: request(`/api/quiz-sessions/${sessionId}`, playerTwoCookie, undefined, { method: "GET" }),
  env,
  params: { sessionId },
});
assert.equal(crossTeam.status, 404, "another team cannot enumerate an authoritative session");

const idempotentStartResponse = await startSession(startContext(playerOneCookie, {
  sourceType: "script", sourceId: "script-a", idempotencyKey: "start-script-a",
}, env));
const idempotentStart = await idempotentStartResponse.json();
assert.equal(idempotentStartResponse.status, 200, "same start idempotency key resumes the original session");
assert.equal(idempotentStart.session.id, sessionId, "idempotent start returns the original session ID");

const sameSourceDifferentKey = await startSession(startContext(playerOneCookie, {
  sourceType: "script", sourceId: "script-a", idempotencyKey: "start-script-a-second-key",
}, env));
assert.equal(sameSourceDifferentKey.status, 200, "the active source can be resumed with a fresh start key");
assert.equal((await sameSourceDifferentKey.json()).session.id, sessionId, "same source never creates a duplicate run");
const differentSourceWhileActive = await startSession(startContext(playerOneCookie, {
  sourceType: "gameplan", sourceId: "gameplan-a", idempotencyKey: "start-gameplan-while-active",
}, env));
assert.equal(differentSourceWhileActive.status, 409, "a different source cannot replace an active verified run");
assert.equal((await differentSourceWhileActive.json()).code, "active_session_exists", "source switch has an explicit conflict code");
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM authoritative_quiz_sessions WHERE team_id = ? AND user_id = ? AND status = 'active'")
    .get("team-a", "player-one").count,
  1,
  "the D1 partial unique index leaves exactly one live session",
);

const firstChoice = firstStart.question.choices[0];
const firstAnswerResponse = await answerSession(answerContext(playerOneCookie, sessionId, {
  ordinal: firstStart.question.ordinal,
  choiceId: firstChoice.id,
}, env));
assert.equal(firstAnswerResponse.status, 200, "the first opaque answer is accepted");
const firstAnswer = await firstAnswerResponse.json();
assert.deepEqual(firstAnswer.answer, {
  ordinal: 1, choiceId: firstChoice.id, recorded: true, idempotent: false,
}, "answer acknowledgement does not reveal correctness");
assert.equal(/isCorrect|correctChoiceId|correct_choice_id|correctCount|wrongCount|score|percent|result/.test(JSON.stringify(firstAnswer)), false, "answer response has no correctness or score oracle");
assert.equal(firstAnswer.nextQuestion.ordinal, 2, "answer response advances to the next public question");
assert.equal(firstAnswer.completeReady, false);

const sameChoiceRetry = await answerSession(answerContext(playerOneCookie, sessionId, {
  ordinal: 1, choiceId: firstChoice.id,
}, env));
assert.equal(sameChoiceRetry.status, 200, "lost-response retry with the same choice stays idempotent");
assert.equal((await sameChoiceRetry.json()).answer.idempotent, true, "same choice retry is marked idempotent");
const conflictingRetry = await answerSession(answerContext(playerOneCookie, sessionId, {
  ordinal: 1, choiceId: firstStart.question.choices.find((choice) => choice.id !== firstChoice.id).id,
}, env));
assert.equal(conflictingRetry.status, 409, "a later conflicting choice cannot overwrite the first answer");

const nextQuestion = firstAnswer.nextQuestion;
const secondCorrect = db.raw.prepare("SELECT correct_choice_id FROM authoritative_quiz_questions WHERE session_id = ? AND ordinal = 1")
  .get(sessionId).correct_choice_id;
const secondAnswerResponse = await answerSession(answerContext(playerOneCookie, sessionId, {
  ordinal: nextQuestion.ordinal, choiceId: secondCorrect,
}, env));
assert.equal(secondAnswerResponse.status, 200, "the final answer is accepted with an opaque choice ID");
const secondAnswer = await secondAnswerResponse.json();
assert.equal(secondAnswer.nextQuestion, null, "there is no question after the final answer");
assert.equal(secondAnswer.completeReady, true, "final answer explicitly enables completion");
assert.equal(secondAnswer.isComplete, false, "answering is not the same as recording a score");

const nonEmptyComplete = await completeSession(completeContext(playerOneCookie, sessionId, { forgedScore: 100 }, env));
assert.equal(nonEmptyComplete.status, 400, "completion rejects browser score fields instead of ignoring them");
const [completeOneResponse, completeTwoResponse] = await Promise.all([
  completeSession(completeContext(playerOneCookie, sessionId, {}, env)),
  completeSession(completeContext(playerOneCookie, sessionId, {}, env)),
]);
const completeOne = await completeOneResponse.json();
const completeTwo = await completeTwoResponse.json();
assert.equal(completeOneResponse.status, 200);
assert.equal(completeTwoResponse.status, 200);
assert.equal(completeOne.isComplete, true);
assert.equal(completeTwo.isComplete, true);
assert.equal(completeOne.session.result.attemptId, completeTwo.session.result.attemptId, "completion races return the one stored attempt");
const trustedAttempt = db.raw.prepare("SELECT score_origin, authoritative_session_id, score, total_points, correct, week_key FROM player_quiz_attempts WHERE team_id = ? AND authoritative_session_id = ?")
  .get("team-a", sessionId);
assert.equal(trustedAttempt.score_origin, "server", "only completion stamps the trusted server origin");
assert.equal(trustedAttempt.authoritative_session_id, sessionId, "the trusted attempt is permanently linked to its source session");
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM player_quiz_attempts WHERE team_id = ? AND authoritative_session_id = ?").get("team-a", sessionId).count,
  1,
  "completion races insert exactly one trusted attempt",
);
const actualCorrect = db.raw.prepare("SELECT SUM(is_correct) AS correct FROM authoritative_quiz_questions WHERE session_id = ?").get(sessionId).correct;
assert.equal(trustedAttempt.score, Number(actualCorrect) * 10, "server derives score from stored answer rows");
assert.equal(trustedAttempt.total_points, trustedAttempt.score, "server derives total points without browser bonus input");
assert.match(trustedAttempt.week_key, /^\d{4}-W\d{2}$/, "server stamps an ISO week key");
assert.equal(
  db.raw.prepare("SELECT release_revision FROM authoritative_quiz_sessions WHERE id = ?").get(sessionId).release_revision,
  "released-revision-a",
  "the session pins the exact canonical release revision used for questions",
);

const browserAttemptRejected = await syncLeaderboard({
  request: request("/api/leaderboard/sync", playerOneCookie, { attempts: [{ id: "browser-attempt-1" }] }),
  env,
});
assert.equal(browserAttemptRejected.status, 400, "legacy browser attempts cannot create new verified rows");
const refreshOnly = await syncLeaderboard({ request: request("/api/leaderboard/sync", playerOneCookie, { attempts: [] }), env });
assert.equal(refreshOnly.status, 200, "an empty player sync remains a summary refresh");
assert.equal((await refreshOnly.json()).synced.refreshOnly, true, "empty sync reports its non-writing contract");
db.raw.prepare(`INSERT INTO player_quiz_attempts (
  id, team_id, user_id, player_name, score, total_points, answered, correct, wrong,
  total_questions, remaining, percent, completed, date_key, week_key, updated_at, score_origin
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'legacy_client')`)
  .run("legacy-client-a", "team-a", "player-one", "Player One", 999, 999, 1, 1, 0, 1, 0, 100, "2026-01-01", trustedAttempt.week_key, 1);
db.raw.prepare(`INSERT INTO player_reward_events (
  id, team_id, user_id, player_name, type, label, points, status, date_key, week_key, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run("legacy-reward-a", "team-a", "player-one", "Player One", "gift", "Forged browser reward", 999, "approved", "2026-01-01", trustedAttempt.week_key, 1);
db.raw.prepare(`INSERT INTO player_helmet_stickers (
  id, team_id, user_id, player_name, sticker_key, label, icon, color, date_key, week_key, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run("legacy-sticker-a", "team-a", "player-one", "Player One", "forged", "Forged browser sticker", "!", "gold", "2026-01-01", trustedAttempt.week_key, 1);
assert.equal(
  db.raw.prepare("SELECT reward_origin FROM player_reward_events WHERE team_id = ? AND id = ?").get("team-a", "legacy-reward-a").reward_origin,
  "legacy_client",
  "migration defaults historic reward rows to untrusted",
);
assert.equal(
  db.raw.prepare("SELECT sticker_origin FROM player_helmet_stickers WHERE team_id = ? AND id = ?").get("team-a", "legacy-sticker-a").sticker_origin,
  "legacy_client",
  "migration defaults historic sticker rows to untrusted",
);
const verifiedSummaryResponse = await leaderboardSummary({
  request: request(`/api/leaderboard/summary?weekKey=${encodeURIComponent(trustedAttempt.week_key)}`, playerOneCookie, undefined, { method: "GET" }),
  env,
});
assert.equal(verifiedSummaryResponse.status, 200, "verified summary remains available to a named player");
const verifiedSummary = await verifiedSummaryResponse.json();
assert.equal(verifiedSummary.summary.week.totals.quizPoints, trustedAttempt.total_points, "leaderboard excludes legacy client-origin scores from verified standings");
assert.equal(verifiedSummary.summary.week.totals.rewardPoints, 0, "leaderboard excludes legacy client-origin reward points from verified standings");
assert.equal(verifiedSummary.summary.week.totals.stickers, 0, "leaderboard excludes legacy client-origin stickers from verified standings");

const [gamePlanRaceOneResponse, gamePlanRaceTwoResponse] = await Promise.all([
  startSession(startContext(playerOneCookie, { sourceType: "gameplan", sourceId: "gameplan-a", idempotencyKey: "race-gameplan-a" }, env)),
  startSession(startContext(playerOneCookie, { sourceType: "gameplan", sourceId: "gameplan-a", idempotencyKey: "race-gameplan-b" }, env)),
]);
const gamePlanRaceOne = await gamePlanRaceOneResponse.json();
const gamePlanRaceTwo = await gamePlanRaceTwoResponse.json();
assert.equal(gamePlanRaceOne.session.id, gamePlanRaceTwo.session.id, "racing first starts atomically converge on one active session");
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM authoritative_quiz_sessions WHERE team_id = ? AND user_id = ? AND status = 'active'")
    .get("team-a", "player-one").count,
  1,
  "concurrent starts leave exactly one active session",
);
db.raw.prepare("UPDATE authoritative_quiz_sessions SET expires_at = 0 WHERE id = ?").run(gamePlanRaceOne.session.id);

const expiryStartResponse = await startSession(startContext(playerOneCookie, {
  sourceType: "script", sourceId: "script-expire", idempotencyKey: "start-expire-a",
}, env));
const expiryStart = await expiryStartResponse.json();
const expirySessionId = expiryStart.session.id;
for (const question of [expiryStart.question]) {
  const correct = db.raw.prepare("SELECT correct_choice_id FROM authoritative_quiz_questions WHERE session_id = ? AND ordinal = ?")
    .get(expirySessionId, question.ordinal - 1).correct_choice_id;
  await answerSession(answerContext(playerOneCookie, expirySessionId, { ordinal: question.ordinal, choiceId: correct }, env));
}
const expiryNext = (await getSession({
  request: request(`/api/quiz-sessions/${expirySessionId}`, playerOneCookie, undefined, { method: "GET" }), env, params: { sessionId: expirySessionId },
})).status;
assert.equal(expiryNext, 200, "an active session can be resumed before expiry");
const expiryQuestion = await db.prepare("SELECT ordinal, correct_choice_id FROM authoritative_quiz_questions WHERE session_id = ? AND ordinal = 1").bind(expirySessionId).first();
await answerSession(answerContext(playerOneCookie, expirySessionId, { ordinal: Number(expiryQuestion.ordinal) + 1, choiceId: expiryQuestion.correct_choice_id }, env));
db.raw.prepare("UPDATE authoritative_quiz_sessions SET expires_at = 0 WHERE id = ?").run(expirySessionId);
const expiredCompletion = await completeSession(completeContext(playerOneCookie, expirySessionId, {}, env));
assert.equal(expiredCompletion.status, 409, "an expired fully answered session cannot be completed");
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM player_quiz_attempts WHERE team_id = ? AND authoritative_session_id = ?").get("team-a", expirySessionId).count,
  0,
  "expiry rejection creates no partial trusted attempt",
);

db.raw.exec(`
  CREATE TRIGGER fail_authoritative_question_insert
  BEFORE INSERT ON authoritative_quiz_questions
  WHEN NEW.session_id IS NOT NULL AND NEW.ordinal = 1
  BEGIN SELECT RAISE(ABORT, 'forced quiz question failure'); END;
`);
const failedBatch = await startSession(startContext(playerOneCookie, {
  sourceType: "script", sourceId: "script-fail", idempotencyKey: "start-failure-a",
}, env));
assert.equal(failedBatch.status, 503, "failed snapshot insert is reported without exposing database details");
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM authoritative_quiz_sessions WHERE source_id = 'script-fail'").get().count,
  0,
  "D1 batch rollback leaves no partial session when a question insert fails",
);

console.log("authoritative quiz sessions: auth, release pinning, opaque answers, and server-only scoring verified");
