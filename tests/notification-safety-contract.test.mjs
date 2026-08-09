import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { createSessionCookie } = await import("../functions/_lib/auth.js");
const { onRequest: authMiddleware } = await import("../functions/_middleware.js");
const { onRequestPost: broadcastNotification } = await import("../functions/api/notifications/broadcast.js");
const {
  onRequestGet: getQuizAssignments,
  onRequestPost: postQuizAssignment,
} = await import("../functions/api/quiz-assignments/index.js");

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
      first_name TEXT,
      last_name TEXT,
      roster_player_id TEXT,
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
    CREATE TABLE notification_outbox (
      id TEXT PRIMARY KEY,
      event_key TEXT NOT NULL,
      team_id TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      delivery_kind TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      deep_link TEXT,
      tag TEXT,
      homework_assignment_id TEXT,
      homework_delivery_event_type TEXT,
      state TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      available_at INTEGER NOT NULL,
      lease_token TEXT,
      lease_expires_at INTEGER,
      last_error TEXT,
      push_sent INTEGER NOT NULL DEFAULT 0,
      push_total INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      queued_at INTEGER,
      delivered_at INTEGER,
      cancelled_at INTEGER,
      dead_at INTEGER,
      updated_at INTEGER NOT NULL,
      UNIQUE (event_key, recipient_user_id)
    );
    CREATE TABLE notification_outbox_events (
      event_key TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      delivery_kind TEXT NOT NULL,
      homework_assignment_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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
      created_at INTEGER NOT NULL,
      notification_outbox_id TEXT
    );
    CREATE TABLE quiz_assignment_initial_notification_dispatches (
      assignment_id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      payload_fingerprint TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      outbox_persisted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_quiz_assignment_delivery_events_outbox
      ON quiz_assignment_delivery_events(notification_outbox_id)
      WHERE notification_outbox_id IS NOT NULL;
    CREATE TRIGGER trg_notification_outbox_insert_notification
    AFTER INSERT ON notification_outbox
    BEGIN
      INSERT OR IGNORE INTO notifications
        (id, user_id, type, title, body, deep_link, created_at, expires_at)
      VALUES
        (NEW.id, NEW.recipient_user_id, NEW.notification_type, NEW.title,
         NEW.body, NEW.deep_link, NEW.created_at, NEW.created_at + 2592000);
    END;
    CREATE TRIGGER trg_notification_outbox_insert_homework_receipt
    AFTER INSERT ON notification_outbox
    WHEN NEW.delivery_kind = 'quiz_homework'
     AND NEW.homework_delivery_event_type IN ('assigned', 'reminded')
    BEGIN
      INSERT OR IGNORE INTO quiz_assignment_delivery_events
        (id, assignment_id, user_id, event_type, created_at, notification_outbox_id)
      VALUES
        (lower(hex(randomblob(16))), NEW.homework_assignment_id,
         NEW.recipient_user_id, NEW.homework_delivery_event_type,
         NEW.created_at, NEW.id);
    END;
    CREATE TRIGGER trg_notification_outbox_reminder_receipt
    AFTER INSERT ON quiz_assignment_delivery_events
    WHEN NEW.notification_outbox_id IS NOT NULL AND NEW.event_type = 'reminded'
    BEGIN
      UPDATE quiz_assignment_recipients
         SET last_reminded_at = NEW.created_at,
             notification_count = notification_count + 1
       WHERE assignment_id = NEW.assignment_id
         AND user_id = NEW.user_id;
    END;
  `);

  const calls = [];
  const faults = { failOutboxInsert: false };
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
            __sql: sql,
          };
        },
      };
    },
    async batch(statements) {
      raw.exec("BEGIN IMMEDIATE");
      try {
        if (faults.failOutboxInsert && statements.some((statement) => (
          String(statement?.__sql || "").includes("INSERT OR IGNORE INTO notification_outbox")
        ))) {
          throw new Error("forced notification outbox failure");
        }
        const results = statements.map((statement) => statement.__run());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
    faults,
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

function getRequest(path, cookie) {
  return new Request(`https://bcoffense.example${path}`, {
    method: "GET",
    headers: {
      Cookie: cookie.split(";")[0],
      "X-BC-Auth-Mode": "json",
    },
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
  [],
  "homework requests write durable outbox rows instead of sending push inline",
);
assert.deepEqual(
  db.raw.prepare("SELECT recipient_user_id FROM notification_outbox WHERE delivery_kind = 'quiz_homework' ORDER BY recipient_user_id")
    .all().map((row) => ({ ...row })),
  [{ recipient_user_id: "active-player" }],
  "only a still-active same-team player receives a durable homework delivery intent",
);

const responseLossPublish = {
  action: "publish",
  assignmentId: "response-loss-assignment",
  title: "Response-loss recovery homework",
  items: [{ play: { play: "Counter" } }],
  questionTypes: ["call"],
  recipientIds: ["active-player"],
  quizMode: "quick",
};
db.faults.failOutboxInsert = true;
const interruptedPublish = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, responseLossPublish), env,
});
assert.equal(interruptedPublish.status, 500, "an injected outbox failure surfaces after the domain publish transaction");
assert.equal(
  db.raw.prepare("SELECT status FROM quiz_assignments WHERE id = ?").get("response-loss-assignment").status,
  "published",
  "the domain publication and its durable dispatch marker commit together before a recoverable fanout fault",
);
assert.equal(
  db.raw.prepare("SELECT state FROM quiz_assignment_initial_notification_dispatches WHERE assignment_id = ?")
    .get("response-loss-assignment").state,
  "pending",
  "a failed initial fanout leaves a durable pending-dispatch marker",
);
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE homework_assignment_id = ?")
    .get("response-loss-assignment").count,
  0,
  "the forced failure leaves no partial outbox row that could look delivered",
);

db.faults.failOutboxInsert = false;
const recoveredPublish = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, responseLossPublish), env,
});
assert.equal(recoveredPublish.status, 200, "retrying the same client-assigned assignment id reconciles a published pending dispatch");
assert.equal((await recoveredPublish.json()).recovered, true, "the retry response identifies the recovered publish path");
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM quiz_assignments WHERE id = ?").get("response-loss-assignment").count,
  1,
  "response-loss retry does not create a duplicate published assignment",
);
assert.equal(
  db.raw.prepare("SELECT state FROM quiz_assignment_initial_notification_dispatches WHERE assignment_id = ?")
    .get("response-loss-assignment").state,
  "outbox_persisted",
  "the marker is acknowledged only after the retry's outbox transaction succeeds",
);
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE homework_assignment_id = ?")
    .get("response-loss-assignment").count,
  1,
  "retry reconciliation creates exactly one recipient outbox intent",
);
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM notifications WHERE deep_link = ?")
    .get("quiz-assignment:response-loss-assignment").count,
  1,
  "retry reconciliation restores the matching player inbox notification once",
);

const changedRetry = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, {
    ...responseLossPublish,
    title: "Changed after publish must not be accepted as recovery",
  }), env,
});
assert.equal(changedRetry.status, 500, "a changed payload cannot impersonate a publish retry");
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE homework_assignment_id = ?")
    .get("response-loss-assignment").count,
  1,
  "rejected changed retry leaves the original outbox fanout unchanged",
);

const backgroundRecoveryPublish = {
  ...responseLossPublish,
  assignmentId: "background-marker-recovery",
  title: "Background marker recovery homework",
};
db.faults.failOutboxInsert = true;
const interruptedBackgroundPublish = await postQuizAssignment({
  request: request("/api/quiz-assignments", adminCookie, backgroundRecoveryPublish), env,
});
assert.equal(interruptedBackgroundPublish.status, 500, "a second forced fanout failure leaves work for autonomous reconciliation");
db.faults.failOutboxInsert = false;
const backgroundRecovery = await getQuizAssignments({
  request: getRequest("/api/quiz-assignments", adminCookie), env,
});
assert.equal(backgroundRecovery.status, 200, "staff assignment refresh reconciles pending initial-dispatch markers");
assert.equal(
  db.raw.prepare("SELECT state FROM quiz_assignment_initial_notification_dispatches WHERE assignment_id = ?")
    .get("background-marker-recovery").state,
  "outbox_persisted",
  "background reconciliation advances the stored marker after durable fanout",
);
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE homework_assignment_id = ?")
    .get("background-marker-recovery").count,
  1,
  "background reconciliation creates the missing notification intent exactly once",
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
