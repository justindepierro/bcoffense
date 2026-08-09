import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [workerSource, config] = await Promise.all([
  source("workers/notification-delivery-worker.js"),
  source("wrangler.notifications.toml"),
]);

assert.match(
  workerSource,
  /import \{[\s\S]*?claimNotificationOutboxDelivery,[\s\S]*?findDueNotificationOutboxIds,[\s\S]*?\} from "\.\.\/functions\/_lib\/notification-outbox\.js"/,
  "the queue worker delegates durable state transitions to the shared outbox helper",
);
assert.match(workerSource, /keys\.length !== 2 \|\| keys\[0\] !== "id" \|\| keys\[1\] !== "v"/, "queue messages accept only opaque version/id envelopes");
assert.match(workerSource, /message\.ack\(\);[\s\S]*?return;/, "invalid queue messages are explicitly acknowledged");
assert.match(workerSource, /TERMINAL_CLAIM_STATES\.has\(claim\?\.state\)[\s\S]*?message\.ack\(\)/, "duplicate or terminal delivery claims are explicitly acknowledged");
assert.match(workerSource, /outcome\?\.hasRetryableFailure/, "only retryable push outcomes re-enter the durable retry path");
assert.match(workerSource, /outcome\?\.retryAfterSeconds[\s\S]*?"push"[\s\S]*?retryAfterSeconds/, "a provider Retry-After floor is forwarded into the durable retry delay");
assert.match(workerSource, /Number\(outcome\.configuration \|\| 0\) > 0[\s\S]*?"push-configuration"/, "missing VAPID configuration follows the durable retry path before completion");
assert.match(workerSource, /CONFIGURATION_RETRY_SECONDS,[\s\S]*?"configuration"/, "configuration recovery holds preserve the durable retry budget");
assert.match(workerSource, /message\.retry\(\{ delaySeconds \}\)/, "retries are controlled per message rather than by throwing a whole batch");
assert.match(workerSource, /\{ \.\.\.detail, leaseToken \}/, "retry state changes are fenced by the claim lease token");
assert.match(workerSource, /leaseToken: delivery\.leaseToken/, "completion is fenced by the claim lease token");
assert.match(workerSource, /const sweepNow = nowSeconds\(\)/, "the scheduled sweep captures one timestamp so marker reconcile and the due scan agree");
assert.match(workerSource, /findDueNotificationOutboxIds\(env\.DB, sweepNow, SWEEP_LIMIT\)/, "the scheduled worker repairs rows still due in D1 using the captured sweep timestamp");
assert.match(workerSource, /import \{ enqueueNotificationOutboxDeliveries \} from "\.\.\/functions\/_lib\/notification-outbox-queue\.js"/, "the repair sweep reuses the bounded opaque Queue producer bridge");
assert.match(workerSource, /await enqueueNotificationOutboxDeliveries\(null, env, ids\)/, "the repair sweep publishes and marks due rows in bounded Queue/D1 batches rather than serially");
assert.match(workerSource, /terminal: Number\(outcome\?\.terminal \|\| 0\) \|\| 0/, "terminal push outcomes are passed to the final outbox transition");
assert.doesNotMatch(workerSource, /(?:^|\n)\s*async\s+fetch\s*\(/m, "the delivery Worker exposes no HTTP handler");
assert.doesNotMatch(workerSource, /VAPID_(?:PRIVATE|PUBLIC)_KEY\s*[:=]\s*["'`]/, "the worker never hard-codes VAPID secrets");

assert.match(config, /^name = "bcoffense-notification-delivery"$/m, "the consumer has a dedicated Worker name");
assert.match(config, /^workers_dev = false$/m, "the queue consumer does not create a public workers.dev endpoint");
assert.match(config, /^crons = \[ "\*\/5 \* \* \* \*" \]$/m, "the durable repair sweep runs on a bounded schedule");
assert.match(config, /binding = "NOTIFICATION_QUEUE"[\s\S]*?queue = "bcoffense-notifications"/, "the consumer can re-enqueue to the canonical notification queue");
assert.match(config, /\[\[queues\.consumers\]\][\s\S]*?queue = "bcoffense-notifications"[\s\S]*?max_batch_size = 10[\s\S]*?max_retries = 8[\s\S]*?dead_letter_queue = "bcoffense-notifications-dlq"/, "the queue consumer has bounded batches, retries, and a DLQ");
assert.match(config, /\[observability\][\s\S]*?enabled = true/, "production observability is enabled for delivery failures");
assert.match(config, /\[\[d1_databases\]\][\s\S]*?binding = "DB"/, "the worker uses the authoritative D1 binding");

const {
  createNotificationOutboxDeliveries,
  getNotificationOutboxDeliveryState,
} = await import("../functions/_lib/notification-outbox.js");
const {
  default: worker,
  parseNotificationOutboxMessage,
  retryDelaySeconds,
  retryDelayWithFloorSeconds,
  sweepNotificationOutbox,
} = await import("../workers/notification-delivery-worker.js");
const validId = "f58b3e92-a171-4c9b-8f2d-c46bc30c30c8";

assert.deepEqual(
  parseNotificationOutboxMessage({ v: 1, id: validId }),
  { v: 1, id: validId },
  "a well-formed opaque envelope remains usable",
);
assert.equal(parseNotificationOutboxMessage({ v: 1, id: validId, payload: { title: "Do not queue this" } }), null, "payload-bearing queue messages are rejected");
assert.equal(parseNotificationOutboxMessage({ v: 2, id: validId }), null, "unknown message versions are rejected");
assert.equal(parseNotificationOutboxMessage({ v: 1, id: "not-an-outbox-id" }), null, "non-UUID outbox references are rejected");
assert.equal(retryDelaySeconds(1), 30, "the first transient retry backs off by 30 seconds");
assert.equal(retryDelaySeconds(2), 60, "retry backoff grows per message");
assert.equal(retryDelaySeconds(20), 3600, "retry backoff remains bounded");
assert.equal(retryDelayWithFloorSeconds(1, 7200), 7200, "a provider Retry-After above the ordinary one-hour curve is honored");
assert.equal(retryDelayWithFloorSeconds(1, 999999), 86400, "provider retry floors are bounded by Cloudflare Queue's documented 24-hour maximum");

const actionLog = [];
await worker.queue({
  messages: [{
    id: "queue-invalid-1",
    attempts: 1,
    body: { v: 1, id: validId, title: "payload is not allowed" },
    ack() { actionLog.push("ack"); },
    retry() { actionLog.push("retry"); },
  }],
}, {});
assert.deepEqual(actionLog, ["ack"], "an invalid queue message is safely acknowledged without touching delivery bindings");

function makeD1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`
    CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      deep_link TEXT,
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
    CREATE TABLE quiz_assignments (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE quiz_assignment_recipients (
      assignment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_reminded_at INTEGER,
      notification_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (assignment_id, user_id)
    );
    -- 0030 augments this pre-existing table with notification_outbox_id.
    CREATE TABLE quiz_assignment_delivery_events (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  const run = (statement, values) => {
    const result = statement.run(...values);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  };
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

const db = makeD1();
const outboxMigration = await source("migrations/0030_notification_outbox.sql");
db.raw.exec(outboxMigration);
db.raw.prepare("INSERT INTO teams (id, name) VALUES (?, ?)").run("team-a", "Burke Catholic");
db.raw.prepare("INSERT INTO users (id, team_id, role, status) VALUES (?, ?, 'player', 'active')").run("player-a", "team-a");
const now = Math.floor(Date.now() / 1000);
const created = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "worker-contract-first-delivery",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["player-a"],
  notification: { type: "team_update", title: "Film is ready", body: "Watch tonight.", deepLink: "script:1" },
  now,
});
assert.equal(created.createdIds.length, 1, "the fixture creates one eligible durable delivery");

const deliveredActions = [];
const deliveryMessage = {
  id: "queue-delivery-1",
  attempts: 1,
  body: { v: 1, id: created.createdIds[0] },
  ack() { deliveredActions.push("ack"); },
  retry() { deliveredActions.push("retry"); },
};
await worker.queue({ messages: [deliveryMessage] }, { DB: db, NOTIFICATION_QUEUE: { async send() {} } });
assert.deepEqual(deliveredActions, ["ack"], "a no-subscription delivery still completes rather than retried forever");
assert.equal(
  (await getNotificationOutboxDeliveryState(db, created.createdIds[0])).state,
  "delivered",
  "the worker claims and completes the D1 outbox record before acknowledging its message",
);

const duplicateActions = [];
await worker.queue({
  messages: [{
    id: "queue-delivery-duplicate",
    attempts: 1,
    body: { v: 1, id: created.createdIds[0] },
    ack() { duplicateActions.push("ack"); },
    retry() { duplicateActions.push("retry"); },
  }],
}, { DB: db, NOTIFICATION_QUEUE: { async send() {} } });
assert.deepEqual(duplicateActions, ["ack"], "at-least-once duplicate messages are acknowledged after the durable state is terminal");

db.raw.prepare(
  "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)",
).run("configuration-subscription", "player-a", "https://push.example.test/config", "unused", "unused", now);
const configurationFixture = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "worker-contract-missing-vapid",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["player-a"],
  notification: { type: "team_update", title: "VAPID must be configured" },
  now,
});
const configurationActions = [];
await worker.queue({
  messages: [{
    id: "queue-configuration-1",
    attempts: 1,
    body: { v: 1, id: configurationFixture.createdIds[0] },
    ack() { configurationActions.push({ action: "ack" }); },
    retry(options) { configurationActions.push({ action: "retry", options }); },
  }],
}, { DB: db, NOTIFICATION_QUEUE: { async send() {} } });
assert.deepEqual(
  configurationActions,
  [{ action: "retry", options: { delaySeconds: 15 * 60 } }],
  "missing VAPID configuration cannot falsely mark a notification delivered",
);
const configurationState = await getNotificationOutboxDeliveryState(db, configurationFixture.createdIds[0]);
assert.equal(configurationState.state, "pending", "a VAPID configuration failure remains a durable due delivery");
assert.equal(configurationState.attemptCount, 0, "a configuration hold refunds its claim instead of consuming the retry cap");

const sweepFixture = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "worker-contract-sweep-delivery",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["player-a"],
  notification: { type: "team_update", title: "Install is ready" },
  now,
});
const sweepMessages = [];
const sweepResult = await sweepNotificationOutbox({
  DB: db,
  NOTIFICATION_QUEUE: { async send(body, options) { sweepMessages.push({ body, options }); } },
});
assert.deepEqual(
  sweepMessages,
  [{ body: { v: 1, id: sweepFixture.createdIds[0] }, options: { contentType: "json" } }],
  "the scheduled repair sends exactly one opaque JSON due ID",
);
assert.equal(sweepResult.enqueued, 1, "the scheduled repair reports the successful queue publication");
assert.equal(
  (await getNotificationOutboxDeliveryState(db, sweepFixture.createdIds[0])).state,
  "queued",
  "the successful repair publish is marked queued, preventing avoidable repeated sweeps",
);

// A full repair page must not perform a serial Queue.send + D1 update for
// every record. The shared producer bridge sends one 100-message Queue batch
// and uses its parameter-safe set-based D1 marks.
const backlogRecipientIds = [];
for (let index = 0; index < 100; index += 1) {
  const id = `backlog-player-${index}`;
  backlogRecipientIds.push(id);
  db.raw.prepare("INSERT INTO users (id, team_id, role, status) VALUES (?, ?, 'player', 'active')")
    .run(id, "team-a");
}
const backlog = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "worker-contract-sweep-batch",
  deliveryKind: "team_broadcast",
  recipientUserIds: backlogRecipientIds,
  notification: { type: "team_update", title: "Batched repair" },
  now: Math.floor(Date.now() / 1000),
});
const sweepBatches = [];
const batchSweepResult = await sweepNotificationOutbox({
  DB: db,
  NOTIFICATION_QUEUE: {
    async sendBatch(messages) { sweepBatches.push(messages); },
  },
});
assert.equal(batchSweepResult.enqueued, 100, "a full due page is repaired without truncating deliveries");
assert.equal(sweepBatches.length, 1, "a 100-item repair uses one Queue batch rather than serial Queue sends");
assert.equal(sweepBatches[0].length, 100, "the repair Queue batch keeps all 100 opaque IDs together");
assert.equal(
  (await getNotificationOutboxDeliveryState(db, backlog.createdIds[0])).state,
  "queued",
  "batched repair advances durable state only after the Queue batch succeeds",
);
db.raw.close();

console.log("notification delivery worker contract: opaque queue delivery, retry, sweep, and Worker config verified");
