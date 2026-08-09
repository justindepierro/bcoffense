import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { createSessionCookie } = await import("../functions/_lib/auth.js");
const { onRequest: authMiddleware } = await import("../functions/_middleware.js");
const { onRequestPost: broadcastNotification } = await import("../functions/api/notifications/broadcast.js");
const { onRequestPost: postQuizAssignment } = await import("../functions/api/quiz-assignments/index.js");

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [broadcastSource, middlewareSource, assignmentRouteSource, assignmentHelperSource] = await Promise.all([
  source("functions/api/notifications/broadcast.js"),
  source("functions/_middleware.js"),
  source("functions/api/quiz-assignments/index.js"),
  source("functions/_lib/d1-quiz-assignments.js"),
]);

assert.match(
  broadcastSource,
  /isManagedCoachSession\(session\) && !hasCoachPermission\(session, "feature:publish_team"\)/,
  "broadcast independently enforces the managed-coach publishing capability",
);
assert.match(
  middlewareSource,
  /pathname === "\/api\/notifications\/broadcast"\) return hasCoachPermission\(session, "feature:publish_team"\)/,
  "middleware applies the same capability before a managed coach reaches broadcast",
);
assert.match(
  assignmentRouteSource,
  /readBoundedJsonObject\(request, \{ maxBytes: MAX_QUIZ_ASSIGNMENT_BODY_BYTES \}\)/,
  "quiz assignment writes use the bounded JSON reader",
);
assert.match(
  assignmentHelperSource,
  /u\.team_id = \?[\s\S]*?u\.role = 'player'[\s\S]*?u\.status = 'active'/,
  "resend eligibility re-checks the current team, player role, and active status",
);

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
    CREATE TABLE staff_access (
      user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      permissions_json TEXT
    );
    CREATE TABLE account_session_state (
      user_id TEXT PRIMARY KEY,
      invalid_before INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE account_session_epochs (
      user_id TEXT PRIMARY KEY,
      session_epoch TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      deep_link TEXT,
      read_at INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE TABLE push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      failed_at INTEGER
    );
    CREATE TABLE quiz_assignments (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT,
      items_json TEXT NOT NULL,
      question_types_json TEXT NOT NULL DEFAULT '[]',
      custom_questions_json TEXT NOT NULL DEFAULT '[]',
      source_kind TEXT,
      source_id TEXT,
      quiz_mode TEXT NOT NULL DEFAULT 'quick',
      position_key TEXT,
      required_score INTEGER NOT NULL DEFAULT 0,
      due_at INTEGER,
      status TEXT NOT NULL DEFAULT 'published',
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE quiz_assignment_recipients (
      assignment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      assigned_by TEXT,
      assigned_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      latest_attempt_id TEXT,
      best_percent INTEGER NOT NULL DEFAULT 0,
      attempts_count INTEGER NOT NULL DEFAULT 0,
      last_reminded_at INTEGER,
      notification_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (assignment_id, user_id)
    );
    CREATE TABLE quiz_assignment_delivery_events (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const calls = [];
  function run(statement, values) {
    const result = statement.run(...values);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }

  return {
    raw,
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          const statement = raw.prepare(sql);
          return {
            first: async () => statement.get(...values) || null,
            all: async () => {
              calls.push({ sql, values });
              return { success: true, results: statement.all(...values) };
            },
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

function request(path, cookie, body, { rawBody } = {}) {
  return new Request(`https://bcoffense.example${path}`, {
    method: "POST",
    headers: {
      Cookie: cookie.split(";")[0],
      "Content-Type": "application/json",
      "X-BC-Auth-Mode": "json",
    },
    body: rawBody ?? JSON.stringify(body),
  });
}

function seedUser(db, id, role, status, teamId = "team-a") {
  db.raw.prepare(
    "INSERT INTO users (id, email, display_name, role, status, team_id) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, `${id}@example.test`, id.replace(/-/g, " "), role, status, teamId);
}

const db = makeD1();
seedUser(db, "admin", "admin", "active");
seedUser(db, "managed-denied", "coach", "active");
seedUser(db, "managed-publisher", "coach", "active");
seedUser(db, "active-player", "player", "active");
seedUser(db, "inactive-player", "player", "inactive");
seedUser(db, "cross-team-player", "player", "active", "team-b");
db.raw.prepare("INSERT INTO staff_access (user_id, team_id, permissions_json) VALUES (?, ?, ?)")
  .run("managed-denied", "team-a", JSON.stringify(["feature:edit_workspace"]));
db.raw.prepare("INSERT INTO staff_access (user_id, team_id, permissions_json) VALUES (?, ?, ?)")
  .run("managed-publisher", "team-a", JSON.stringify(["feature:publish_team"]));

const env = {
  DB: db,
  AUTH_SESSION_SECRET: "notification-safety-runtime-test-secret",
  AUTH_PRIMARY_TEAM_ID: "team-a",
  AUTH_LEGACY_STATIC_STAFF_ENABLED: "true",
};
const adminCookie = await createSessionCookie({
  username: "admin@example.test", role: "admin", label: "Admin", d1: true, d1_user_id: "admin",
}, env);
const managedDeniedCookie = await createSessionCookie({
  username: "managed-denied@example.test", role: "coach", label: "Managed denied", d1: true, d1_user_id: "managed-denied",
}, env);
const managedPublisherCookie = await createSessionCookie({
  username: "managed-publisher@example.test", role: "coach", label: "Managed publisher", d1: true, d1_user_id: "managed-publisher",
}, env);
const legacyCoachCookie = await createSessionCookie({ username: "coach", role: "coach", label: "Coach" }, env);

const broadcastPayload = { type: "team_update", title: "Film is ready", body: "Check tonight's install." };
const managedDeniedMiddleware = await authMiddleware({
  request: request("/api/notifications/broadcast", managedDeniedCookie, broadcastPayload),
  env,
  next: async () => new Response(null, { status: 204 }),
});
assert.equal(managedDeniedMiddleware.status, 403, "middleware blocks a managed coach without publishing access before the route runs");
const managedPublisherMiddleware = await authMiddleware({
  request: request("/api/notifications/broadcast", managedPublisherCookie, broadcastPayload),
  env,
  next: async () => new Response(null, { status: 204 }),
});
assert.equal(managedPublisherMiddleware.status, 204, "middleware lets a managed coach with publishing access reach broadcast");

const notificationsBeforeDeniedBroadcast = db.raw.prepare("SELECT COUNT(*) AS count FROM notifications").get().count;
const managedDeniedBroadcast = await broadcastNotification({
  request: request("/api/notifications/broadcast", managedDeniedCookie, broadcastPayload), env,
});
assert.equal(managedDeniedBroadcast.status, 403, "a managed coach without publishing access cannot fan out a team alert");
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM notifications").get().count,
  notificationsBeforeDeniedBroadcast,
  "denied managed-coach broadcasts do not create player inbox records",
);

const managedPublisherBroadcast = await broadcastNotification({
  request: request("/api/notifications/broadcast", managedPublisherCookie, broadcastPayload), env,
});
assert.equal(managedPublisherBroadcast.status, 200, "a managed coach with publishing access can send a team alert");
assert.equal((await managedPublisherBroadcast.json()).recipients, 1, "team alert delivery remains limited to active same-team players");

const adminBroadcast = await broadcastNotification({
  request: request("/api/notifications/broadcast", adminCookie, broadcastPayload), env,
});
assert.equal(adminBroadcast.status, 200, "an administrator retains full broadcast access");
const legacyCoachBroadcast = await broadcastNotification({
  request: request("/api/notifications/broadcast", legacyCoachCookie, broadcastPayload), env,
});
assert.equal(legacyCoachBroadcast.status, 200, "a full legacy coach retains existing broadcast access");

db.raw.prepare(`INSERT INTO quiz_assignments
  (id, team_id, title, items_json, question_types_json, custom_questions_json, quiz_mode, required_score, status, created_by, created_at, updated_at)
  VALUES (?, ?, ?, '[]', '[]', '[]', 'quick', 0, 'published', ?, 1, 1)`)
  .run("homework-1", "team-a", "Install one", "admin");
for (const userId of ["active-player", "inactive-player", "cross-team-player"]) {
  db.raw.prepare(
    "INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_by, assigned_at) VALUES (?, ?, ?, 1)",
  ).run("homework-1", userId, "admin");
}

const callsBeforeResend = db.calls.length;
const resend = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, { action: "resend", assignmentId: "homework-1" }), env,
});
assert.equal(resend.status, 200, "an administrator can resend active homework");
assert.equal((await resend.json()).recipients, 1, "resend re-checks recipients instead of trusting stale assignment rows");
assert.deepEqual(
  db.raw.prepare("SELECT user_id FROM notifications WHERE type = 'quiz_homework' ORDER BY user_id").all().map((row) => ({ ...row })),
  [{ user_id: "active-player" }],
  "only the active same-team player receives a homework inbox reminder",
);
assert.deepEqual(
  db.raw.prepare("SELECT user_id FROM quiz_assignment_delivery_events WHERE assignment_id = ? ORDER BY user_id")
    .all("homework-1").map((row) => ({ ...row })),
  [{ user_id: "active-player" }],
  "only a revalidated player receives a homework delivery receipt",
);
assert.deepEqual(
  db.raw.prepare("SELECT user_id, notification_count FROM quiz_assignment_recipients WHERE assignment_id = ? ORDER BY user_id")
    .all("homework-1").map((row) => ({ ...row })),
  [
    { user_id: "active-player", notification_count: 1 },
    { user_id: "cross-team-player", notification_count: 0 },
    { user_id: "inactive-player", notification_count: 0 },
  ],
  "resend status changes only for recipients who are still eligible",
);
const resendPushLookups = db.calls.slice(callsBeforeResend)
  .filter((call) => call.sql.includes("FROM push_subscriptions"))
  .map((call) => call.values[0]);
assert.deepEqual(
  resendPushLookups,
  ["active-player"],
  "push delivery is not even attempted for disabled or cross-team recipients",
);

const arrayBody = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, null, { rawBody: "[]" }), env,
});
assert.equal(arrayBody.status, 400, "quiz assignment writes reject JSON arrays instead of treating them as objects");
assert.equal((await arrayBody.json()).error, "Invalid request.", "array bodies keep the established request error envelope");

const nonTextAction = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, { action: { resend: true }, assignmentId: "homework-1" }), env,
});
assert.equal(nonTextAction.status, 400, "quiz assignment actions must be text, not coerced JSON values");
assert.equal((await nonTextAction.json()).error, "Invalid request.", "invalid action types use the safe request envelope");

const largeValidHomework = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, {
    action: "resend", assignmentId: "homework-1", padding: "x".repeat(256 * 1024),
  }), env,
});
assert.equal(largeValidHomework.status, 200, "the homework ceiling leaves room for full play snapshots beyond small account-form limits");

const oversizedBody = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, null, {
    rawBody: `{"action":"archive","padding":"${"x".repeat((2 * 1024 * 1024) + 1)}"}`,
  }), env,
});
assert.equal(oversizedBody.status, 413, "quiz assignment writes reject payloads beyond the finite request ceiling");
assert.equal((await oversizedBody.json()).error, "Homework request is too large.", "oversized homework payloads retain a safe JSON error");

db.raw.close();
console.log("notification safety contract: broadcast capabilities, recipient revalidation, and bounded homework input verified");
