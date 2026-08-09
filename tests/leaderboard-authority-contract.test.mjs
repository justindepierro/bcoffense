import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { createSessionCookie } = await import("../functions/_lib/auth.js");
const { onRequestPost: syncLeaderboard } = await import("../functions/api/leaderboard/sync.js");
const { onRequestPost: mutateAward } = await import("../functions/api/leaderboard/awards.js");
const { onRequestPost: recordAssignment } = await import("../functions/api/quiz-assignments/index.js");
const { getPlayerQuizAssignments } = await import("../functions/_lib/d1-quiz-assignments.js");

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [leaderboardHelper, syncRoute, awardsRoute, assignmentHelper, assignmentClient] = await Promise.all([
  source("functions/_lib/d1-leaderboard.js"),
  source("functions/api/leaderboard/sync.js"),
  source("functions/api/leaderboard/awards.js"),
  source("functions/_lib/d1-quiz-assignments.js"),
  source("js/script-quiz-assignments.js"),
]);

assert.match(leaderboardHelper, /ON CONFLICT\(team_id, id\) DO NOTHING/, "attempt and staff record IDs are insert-only/idempotent");
assert.match(syncRoute, /readLeaderboardPayload\(request\)/, "player sync streams a bounded request body");
assert.match(awardsRoute, /hasCoachPermission\(session, "tab:leaderboard"\)/, "award mutations require coach/admin leaderboard access");
assert.match(assignmentHelper, /recordLegacyQuizAssignmentPractice/, "legacy homework results have an explicitly practice-only server path");
assert.match(assignmentClient, /action: "record-practice", assignmentId/, "the browser no longer sends a client score to homework");

function makeD1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`
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
    CREATE TABLE roster_players (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT, display_name TEXT, active INTEGER NOT NULL DEFAULT 1);

    CREATE TABLE player_quiz_attempts (
      id TEXT NOT NULL, team_id TEXT NOT NULL, user_id TEXT, player_name TEXT NOT NULL,
      source_type TEXT, source_id TEXT, title TEXT, position_key TEXT, position_label TEXT,
      score INTEGER NOT NULL DEFAULT 0, bonus_points INTEGER NOT NULL DEFAULT 0, total_points INTEGER NOT NULL DEFAULT 0,
      answered INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0, remaining INTEGER NOT NULL DEFAULT 0, percent INTEGER NOT NULL DEFAULT 0,
      badge TEXT, best_streak INTEGER NOT NULL DEFAULT 0, question_breakdown TEXT, review TEXT,
      completed INTEGER NOT NULL DEFAULT 1, date_key TEXT, week_key TEXT, completed_at INTEGER,
      client_updated_at INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (team_id, id)
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

    CREATE TABLE quiz_assignments (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, title TEXT NOT NULL, instructions TEXT,
      items_json TEXT NOT NULL, question_types_json TEXT NOT NULL DEFAULT '[]', custom_questions_json TEXT NOT NULL DEFAULT '[]',
      source_kind TEXT, source_id TEXT, quiz_mode TEXT NOT NULL DEFAULT 'quick', position_key TEXT,
      required_score INTEGER NOT NULL DEFAULT 0, due_at INTEGER, status TEXT NOT NULL DEFAULT 'published',
      created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE quiz_assignment_recipients (
      assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, assigned_by TEXT, assigned_at INTEGER NOT NULL,
      started_at INTEGER, completed_at INTEGER, latest_attempt_id TEXT, best_percent INTEGER NOT NULL DEFAULT 0,
      attempts_count INTEGER NOT NULL DEFAULT 0, last_reminded_at INTEGER, notification_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (assignment_id, user_id)
    );
    CREATE TABLE quiz_assignment_delivery_events (
      id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, user_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('assigned', 'reminded', 'opened', 'attempted', 'completed')),
      created_at INTEGER NOT NULL
    );
  `);

  function run(statement, values) {
    const result = statement.run(...values);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }

  const d1 = {
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
  return d1;
}

function request(path, cookie, body, opts = {}) {
  return new Request(`https://bcoffense.example${path}`, {
    method: "POST",
    headers: {
      Cookie: cookie.split(";")[0],
      "Content-Type": "application/json",
      "X-BC-Auth-Mode": "json",
    },
    body: opts.rawBody ?? JSON.stringify(body),
  });
}

function quizAttempt(id, overrides = {}) {
  return {
    id,
    player: "Someone Else",
    sourceType: "script",
    sourceId: "script-1",
    title: "Install one",
    positionKey: "QB",
    positionLabel: "Quarterback",
    score: 100,
    bonusPoints: 0,
    totalPoints: 100,
    answered: 4,
    correct: 4,
    wrong: 0,
    totalQuestions: 4,
    remaining: 0,
    percent: 100,
    badge: "Perfect",
    bestStreak: 4,
    questionBreakdown: {},
    review: {},
    completed: true,
    ...overrides,
  };
}

const db = makeD1();
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, ?, 'active', ?)")
  .run("player-one", "player.one@example.com", "Player One", "player", "team-a");
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, ?, 'active', ?)")
  .run("player-two", "player.two@example.com", "Player Two", "player", "team-a");
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, ?, 'active', ?)")
  .run("coach-one", "coach@example.com", "Head Coach", "admin", "team-a");
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, ?, 'inactive', ?)")
  .run("inactive-player", "inactive@example.com", "Inactive Player", "player", "team-a");
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, ?, 'active', ?)")
  .run("other-team-player", "other.team@example.com", "Other Team Player", "player", "team-b");
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, ?, 'active', ?)")
  .run("duplicate-email-one", "duplicate@example.com", "Duplicate One", "player", "team-a");
db.raw.prepare("INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, ?, 'active', ?)")
  .run("duplicate-email-two", "duplicate@example.com", "Duplicate Two", "player", "team-a");
db.raw.prepare("INSERT INTO roster_players (id, team_id, user_id, display_name, active) VALUES (?, ?, ?, ?, 1)")
  .run("roster-player-one", "team-a", "player-one", "Player One");

const env = {
  DB: db,
  AUTH_SESSION_SECRET: "leaderboard-authority-runtime-test-secret",
  AUTH_PRIMARY_TEAM_ID: "team-a",
};
const playerCookie = await createSessionCookie({
  username: "player.one@example.com", role: "player", label: "Forged Label", d1: true, d1_user_id: "player-one",
}, env);
const coachCookie = await createSessionCookie({
  username: "coach@example.com", role: "admin", label: "Head Coach", d1: true, d1_user_id: "coach-one",
}, env);
const staticPlayerCookie = await createSessionCookie({ username: "player", role: "player", label: "Player" }, env);

const acceptedAttempt = await syncLeaderboard({
  request: request("/api/leaderboard/sync", playerCookie, { attempts: [quizAttempt("quiz-00000001")] }),
  env,
});
assert.equal(acceptedAttempt.status, 200, "an active D1 player can submit a well-formed own attempt");
assert.equal((await acceptedAttempt.json()).synced.attempts, 1, "the accepted attempt is reported as inserted");
let storedAttempt = db.raw.prepare("SELECT user_id, player_name, total_points FROM player_quiz_attempts WHERE team_id = ? AND id = ?")
  .get("team-a", "quiz-00000001");
assert.deepEqual({ ...storedAttempt }, { user_id: "player-one", player_name: "Player One", total_points: 100 }, "the server ignores a forged player name and uses the D1 player identity");

const retryAttempt = await syncLeaderboard({
  request: request("/api/leaderboard/sync", playerCookie, {
    attempts: [quizAttempt("quiz-00000001", { score: 200, totalPoints: 200 })],
  }),
  env,
});
assert.equal(retryAttempt.status, 200, "retrying a stable attempt ID succeeds safely");
assert.equal((await retryAttempt.json()).synced.duplicates, 1, "the retry is recognized as an idempotent duplicate");
storedAttempt = db.raw.prepare("SELECT total_points FROM player_quiz_attempts WHERE team_id = ? AND id = ?")
  .get("team-a", "quiz-00000001");
assert.equal(storedAttempt.total_points, 100, "a duplicate ID cannot rewrite an accepted score");

const forgedReward = await syncLeaderboard({
  request: request("/api/leaderboard/sync", playerCookie, { attempts: [], rewards: [{ id: "reward-00000001" }] }),
  env,
});
assert.equal(forgedReward.status, 400, "the player attempt route rejects reward snapshots");
const staticPlayer = await syncLeaderboard({
  request: request("/api/leaderboard/sync", staticPlayerCookie, { attempts: [] }),
  env,
});
assert.equal(staticPlayer.status, 403, "a shared/static player session cannot write a named player attempt");
const oversized = await syncLeaderboard({
  request: request("/api/leaderboard/sync", playerCookie, null, {
    rawBody: `{"attempts":[],"padding":"${"x".repeat(131073)}"}`,
  }),
  env,
});
assert.equal(oversized.status, 400, "the player route rejects a body beyond its finite payload cap");

const playerAward = await mutateAward({
  request: request("/api/leaderboard/awards", playerCookie, { kind: "reward", action: "create", record: {} }),
  env,
});
assert.equal(playerAward.status, 403, "players cannot call the staff award route");

const createdAward = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "reward",
    action: "create",
    target: { email: "player.one@example.com" },
    record: {
      id: "reward-00000001", player: "Forged Player", type: "gift", label: "Coach Gift", points: 40,
      note: "Great effort", awardedBy: "Forged Coach", status: "approved",
    },
  }),
  env,
});
assert.equal(createdAward.status, 200, "an admin can create a staff-owned reward for an active same-team player");
let storedAward = db.raw.prepare("SELECT user_id, player_name, awarded_by, points, status FROM player_reward_events WHERE team_id = ? AND id = ?")
  .get("team-a", "reward-00000001");
assert.deepEqual({ ...storedAward }, {
  user_id: "player-one", player_name: "Player One", awarded_by: "Head Coach", points: 40, status: "approved",
}, "the staff route resolves canonical player and staff identities instead of trusting the browser");

const createdSticker = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "sticker", action: "create", target: { name: "Player One" },
    record: { id: "sticker-00000001", stickerKey: "film-junkie", label: "Film Junkie", icon: "🏈", color: "gold" },
  }),
  env,
});
assert.equal(createdSticker.status, 200, "an admin can create a staff-owned sticker for an active same-team player");
const storedSticker = db.raw.prepare("SELECT user_id, player_name, awarded_by, color FROM player_helmet_stickers WHERE team_id = ? AND id = ?")
  .get("team-a", "sticker-00000001");
assert.deepEqual({ ...storedSticker }, {
  user_id: "player-one", player_name: "Player One", awarded_by: "Head Coach", color: "gold",
}, "sticker identity and author are also resolved by the server");
const revokedSticker = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "sticker", action: "revoke", record: { id: "sticker-00000001" },
  }),
  env,
});
assert.equal(revokedSticker.status, 200, "a staff sticker can be revoked through the protected mutation route");
assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM player_helmet_stickers WHERE team_id = ? AND id = ?").get("team-a", "sticker-00000001").count, 0, "revoke deletes only the scoped sticker record");

const inactiveAward = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "reward", action: "create", target: { email: "inactive@example.com" },
    record: { id: "reward-00000002", type: "gift", label: "Nope", points: 10 },
  }),
  env,
});
assert.equal(inactiveAward.status, 422, "staff cannot target an inactive player");
const crossTeamAward = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "reward", action: "create", target: { email: "other.team@example.com" },
    record: { id: "reward-00000004", type: "gift", label: "Nope", points: 10 },
  }),
  env,
});
assert.equal(crossTeamAward.status, 422, "staff cannot target an active player from another team");
const ambiguousEmailAward = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "reward", action: "create", target: { email: "duplicate@example.com" },
    record: { id: "reward-00000005", type: "gift", label: "Nope", points: 10 },
  }),
  env,
});
assert.equal(ambiguousEmailAward.status, 422, "an ambiguous player email is denied instead of selecting an arbitrary account");

const pendingAward = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "reward", action: "create", target: { name: "Player One" },
    record: { id: "reward-00000003", type: "question", label: "Film question", points: 25, status: "pending_approval" },
  }),
  env,
});
assert.equal(pendingAward.status, 200, "a coach can stage a pending reward through the staff route");
const approvedAward = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "reward", action: "approve", record: { id: "reward-00000003", points: 20, approvedBy: "Forged Coach" },
  }),
  env,
});
assert.equal(approvedAward.status, 200, "a staged reward can be approved through a single staff transition");
storedAward = db.raw.prepare("SELECT points, status, approved_by FROM player_reward_events WHERE team_id = ? AND id = ?")
  .get("team-a", "reward-00000003");
assert.deepEqual({ ...storedAward }, { points: 20, status: "approved", approved_by: "Head Coach" }, "approval uses the server-authenticated coach and bounded approved points");
const revokedAward = await mutateAward({
  request: request("/api/leaderboard/awards", coachCookie, {
    kind: "reward", action: "revoke", record: { id: "reward-00000003" },
  }),
  env,
});
assert.equal(revokedAward.status, 200, "a staff reward can be revoked through the same protected route");
assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM player_reward_events WHERE team_id = ? AND id = ?").get("team-a", "reward-00000003").count, 0, "revoke deletes only the scoped award record");

db.raw.prepare(`INSERT INTO quiz_assignments
  (id, team_id, title, items_json, question_types_json, custom_questions_json, quiz_mode, required_score, status, created_at, updated_at)
  VALUES (?, ?, ?, '[]', '[]', '[]', 'quick', 90, 'published', 1, 1)`)
  .run("assignment-1", "team-a", "Install homework");
db.raw.prepare("INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_at) VALUES (?, ?, 1)")
  .run("assignment-1", "player-one");

const legacyPractice = await recordAssignment({
  request: request("/api/quiz-assignments", playerCookie, {
    action: "record-attempt", assignmentId: "assignment-1", attemptId: "forged-attempt", percent: 100,
  }),
  env,
});
assert.equal(legacyPractice.status, 200, "the former record-attempt action remains a usable practice transition");
const practiceResult = (await legacyPractice.json()).result;
assert.deepEqual(
  { practiceOnly: practiceResult.practiceOnly, verified: practiceResult.verified, completed: practiceResult.completed },
  { practiceOnly: true, verified: false, completed: false },
  "a client-reported percentage never becomes verified homework completion",
);
let recipient = db.raw.prepare("SELECT started_at, completed_at, latest_attempt_id, best_percent, attempts_count FROM quiz_assignment_recipients WHERE assignment_id = ? AND user_id = ?")
  .get("assignment-1", "player-one");
assert.equal(recipient.started_at > 0, true, "practice still marks the assignment as started for normal player UX");
assert.deepEqual(
  { completed_at: recipient.completed_at, latest_attempt_id: recipient.latest_attempt_id, best_percent: recipient.best_percent, attempts_count: recipient.attempts_count },
  { completed_at: null, latest_attempt_id: null, best_percent: 0, attempts_count: 0 },
  "legacy percent and attempt ID cannot write any assignment score or completion columns",
);

db.raw.prepare("UPDATE quiz_assignment_recipients SET completed_at = 123, best_percent = 99, attempts_count = 2 WHERE assignment_id = ? AND user_id = ?")
  .run("assignment-1", "player-one");
const playerAssignments = await getPlayerQuizAssignments(db, "team-a", "player-one");
assert.deepEqual(
  {
    completedAt: playerAssignments[0]?.recipient?.completedAt,
    bestPercent: playerAssignments[0]?.recipient?.bestPercent,
    verificationState: playerAssignments[0]?.recipient?.verificationState,
  },
  { completedAt: null, bestPercent: 0, verificationState: "authoritative-session-required" },
  "historic client-trusted homework scores are hidden until authoritative quiz sessions exist",
);

console.log("leaderboard authority contract: runtime authorization, immutable IDs, and practice-only homework verified");
