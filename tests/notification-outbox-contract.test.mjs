import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  buildNotificationOutboxQueuePayload,
  cancelNotificationOutboxDelivery,
  claimNotificationOutboxDelivery,
  completeNotificationOutboxDelivery,
  createNotificationOutboxDeliveries,
  findDueNotificationOutboxIds,
  getNotificationOutboxDeliveryState,
  markNotificationOutboxQueued,
  parseNotificationOutboxQueuePayload,
  retryNotificationOutboxDelivery,
} from "../functions/_lib/notification-outbox.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = path.join(root, "migrations");
const NOW = 1_700_000_000;

function makeD1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const calls = [];
  return {
    raw,
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          const statement = raw.prepare(sql);
          const run = () => {
            calls.push({ kind: "run", sql, values });
            const result = statement.run(...values);
            return { success: true, meta: { changes: Number(result.changes || 0) } };
          };
          return {
            first: async () => {
              calls.push({ kind: "first", sql, values });
              return statement.get(...values) || null;
            },
            all: async () => {
              calls.push({ kind: "all", sql, values });
              return { success: true, results: statement.all(...values) };
            },
            run: async () => run(),
            __run: run,
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
const migrations = (await readdir(migrationsDir))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
for (const migration of migrations) db.raw.exec(await readFile(path.join(migrationsDir, migration), "utf8"));

function seedUser(id, { teamId = "team-a", role = "player", status = "active" } = {}) {
  db.raw.prepare(
    `INSERT INTO users (id, email, display_name, role, team_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `${id}@example.test`, id, role, teamId, status, NOW, NOW);
}

db.raw.prepare("INSERT INTO teams (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
  .run("team-a", "Team A", NOW, NOW);
db.raw.prepare("INSERT INTO teams (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
  .run("team-b", "Team B", NOW, NOW);
seedUser("active-player");
seedUser("inactive-player", { status: "disabled" });
seedUser("other-team-player", { teamId: "team-b" });
seedUser("race-player");
seedUser("moved-player");

const indexes = db.raw.prepare("PRAGMA index_list('notification_outbox')").all();
assert.ok(indexes.some((row) => row.name === "idx_notification_outbox_event_recipient" && row.unique === 1), "migration makes event/recipient delivery idempotent");
assert.ok(indexes.some((row) => row.name === "idx_notification_outbox_due"), "migration indexes due delivery repair");
assert.ok(indexes.some((row) => row.name === "idx_notification_outbox_lease"), "migration indexes abandoned leases");

const outbox = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:revision-2026-08-09",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player", "inactive-player", "other-team-player", "active-player"],
  notification: {
    type: "team_update",
    title: "Install is ready",
    body: "Open the new install before practice.",
    deepLink: "playbook:install",
    tag: "team-update-install",
  },
  now: NOW,
});
assert.deepEqual(outbox.recipientIds, ["active-player"], "only active players on the requested team receive an outbox record");
assert.equal(outbox.createdIds.length, 1, "one outbox row is created for the eligible recipient");
assert.deepEqual(outbox.pendingIds, outbox.createdIds, "new delivery is pending Queue publication");
const deliveryId = outbox.createdIds[0];
assert.deepEqual(buildNotificationOutboxQueuePayload(deliveryId), { v: 1, id: deliveryId }, "Queue payload contains only the version and opaque id");
assert.deepEqual(parseNotificationOutboxQueuePayload({ v: 1, id: deliveryId }), { v: 1, id: deliveryId }, "strict payload parser accepts the canonical body");
assert.equal(parseNotificationOutboxQueuePayload({ v: 1, id: deliveryId, title: "leak" }), null, "payload parser rejects notification content in Queue data");

const countsAfterFirstCreate = db.raw.prepare(
  "SELECT (SELECT COUNT(*) FROM notification_outbox) AS outbox_count, (SELECT COUNT(*) FROM notifications) AS notification_count",
).get();
assert.equal(countsAfterFirstCreate.outbox_count, 1, "one outbox record commits for the recipient");
assert.equal(countsAfterFirstCreate.notification_count, 1, "matching inbox record commits in the same recipient transaction");
assert.equal(
  db.raw.prepare("SELECT id FROM notifications WHERE user_id = 'active-player'").get().id,
  deliveryId,
  "inbox notification shares the durable outbox id for replay-safe linkage",
);

const originalBatch = db.batch;
let changedRecipientBeforeWrite = false;
db.batch = async (statements) => {
  if (!changedRecipientBeforeWrite) {
    changedRecipientBeforeWrite = true;
    db.raw.prepare("UPDATE users SET status = 'disabled' WHERE id = 'race-player'").run();
  }
  return originalBatch(statements);
};
try {
  const racedCreate = await createNotificationOutboxDeliveries(db, {
    teamId: "team-a",
    eventKey: "team-update:eligibility-race",
    deliveryKind: "team_broadcast",
    recipientUserIds: ["race-player"],
    notification: { type: "team_update", title: "Must not reach a disabled player" },
    now: NOW,
  });
  assert.deepEqual(racedCreate.recipientIds, [], "post-read account changes are rechecked inside the write batch");
  assert.equal(racedCreate.createdIds.length, 0, "an eligibility race creates no outbox row");
} finally {
  db.batch = originalBatch;
}
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE event_key = 'team-update:eligibility-race'").get().count,
  0,
  "eligibility race leaves no durable delivery intent",
);
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM notifications WHERE title = 'Must not reach a disabled player'").get().count,
  0,
  "eligibility race leaves no stale bell notification",
);

const replay = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:revision-2026-08-09",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Changed copy must not duplicate" },
  now: NOW + 1,
});
assert.deepEqual(replay.createdIds, [], "stable event key replay does not create a second delivery");
assert.deepEqual(replay.existingIds, [deliveryId], "stable event key replay returns the original durable id");
assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM notifications").get().count, 1, "stable replay does not duplicate the inbox record");
assert.equal(db.raw.prepare("SELECT title FROM notification_outbox WHERE id = ?").get(deliveryId).title, "Install is ready", "replay preserves persisted notification copy");

await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:scope-collision",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["moved-player"],
  notification: { type: "team_update", title: "Original team event" },
  now: NOW,
});
db.raw.prepare("UPDATE users SET team_id = 'team-b' WHERE id = 'moved-player'").run();
await assert.rejects(
  () => createNotificationOutboxDeliveries(db, {
    teamId: "team-b",
    eventKey: "team-update:scope-collision",
    deliveryKind: "team_broadcast",
    recipientUserIds: ["moved-player"],
    notification: { type: "team_update", title: "Must not reuse another team event" },
    now: NOW + 1,
  }),
  (error) => error?.code === "event_key_collision",
  "a stable event key cannot silently attach a recipient to another team or delivery scope",
);

await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:global-scope-collision",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Original team event scope" },
  now: NOW,
});
await assert.rejects(
  () => createNotificationOutboxDeliveries(db, {
    teamId: "team-b",
    eventKey: "team-update:global-scope-collision",
    deliveryKind: "team_broadcast",
    recipientUserIds: ["other-team-player"],
    notification: { type: "team_update", title: "Must not reuse a globally stable event key" },
    now: NOW + 1,
  }),
  (error) => error?.code === "event_key_collision",
  "an event key cannot be reused by another team even when recipient sets do not overlap",
);
assert.equal(
  db.raw.prepare(
    "SELECT COUNT(*) AS count FROM notification_outbox WHERE event_key = 'team-update:global-scope-collision' AND team_id = 'team-b'",
  ).get().count,
  0,
  "a rejected disjoint-recipient scope collision commits no cross-team outbox row",
);

const queued = await markNotificationOutboxQueued(db, deliveryId, NOW);
assert.deepEqual(queued, { id: deliveryId, state: "queued", queued: true }, "successful Queue send marks the durable intent queued");
const firstClaim = await claimNotificationOutboxDelivery(db, deliveryId, NOW);
assert.equal(firstClaim.state, "claimed", "queued eligible delivery leases successfully");
assert.equal(firstClaim.delivery.id, deliveryId);
assert.equal(firstClaim.delivery.recipientUserId, "active-player");
assert.equal(firstClaim.delivery.teamId, "team-a");
assert.equal(firstClaim.delivery.notification.type, "team_update");
assert.match(firstClaim.delivery.leaseToken, /^[0-9a-f-]{36}$/i, "each claim contains an opaque lease token");
assert.equal((await claimNotificationOutboxDelivery(db, deliveryId, NOW)).state, "not_due", "a live claim suppresses duplicate Queue delivery");

const completed = await completeNotificationOutboxDelivery(db, deliveryId, NOW + 1, {
  leaseToken: firstClaim.delivery.leaseToken,
  pushSent: 1,
  pushTotal: 1,
});
assert.deepEqual(completed, { state: "delivered", id: deliveryId }, "only the active lease can mark a delivery complete");
assert.equal((await claimNotificationOutboxDelivery(db, deliveryId, NOW + 2)).state, "terminal", "completed Queue duplicates are harmless");

const retryable = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:retry-test",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Retry test" },
  now: NOW,
});
const retryId = retryable.createdIds[0];
await markNotificationOutboxQueued(db, retryId, NOW);
const firstRetryClaim = await claimNotificationOutboxDelivery(db, retryId, NOW);
assert.equal(firstRetryClaim.state, "claimed");
assert.equal(
  (await retryNotificationOutboxDelivery(db, retryId, NOW + 1, { leaseToken: "00000000-0000-4000-8000-000000000000", delaySeconds: 30 })).state,
  "stale",
  "a stale worker cannot release another worker's active lease",
);
assert.equal(
  (await retryNotificationOutboxDelivery(db, retryId, NOW + 1, {
    leaseToken: firstRetryClaim.delivery.leaseToken,
    delaySeconds: 30,
    message: "temporary push outage",
  })).state,
  "pending",
  "the active lease can schedule a bounded delayed retry",
);
assert.equal((await claimNotificationOutboxDelivery(db, retryId, NOW + 20)).state, "not_due", "retry delay prevents a hot loop");
const secondRetryClaim = await claimNotificationOutboxDelivery(db, retryId, NOW + 31);
assert.equal(secondRetryClaim.state, "claimed", "due retry can be claimed again");
assert.notEqual(secondRetryClaim.delivery.leaseToken, firstRetryClaim.delivery.leaseToken, "each retry receives a new lease token");
assert.equal(
  (await completeNotificationOutboxDelivery(db, retryId, NOW + 32, {
    leaseToken: firstRetryClaim.delivery.leaseToken,
    pushSent: 1,
    pushTotal: 1,
  })).state,
  "stale",
  "an old worker cannot finalize a delivery reclaimed by a newer worker",
);
await completeNotificationOutboxDelivery(db, retryId, NOW + 32, {
  leaseToken: secondRetryClaim.delivery.leaseToken,
  pushSent: 0,
  pushTotal: 0,
});
assert.equal((await getNotificationOutboxDeliveryState(db, retryId)).state, "delivered", "new lease finalizes the retry safely");

const configurationHeld = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:configuration-hold",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Configuration hold" },
  now: NOW,
});
const configurationHoldId = configurationHeld.createdIds[0];
await markNotificationOutboxQueued(db, configurationHoldId, NOW);
// Put the next claim at the ordinary durable retry boundary. A missing VAPID
// secret must not turn this otherwise recoverable row into a dead letter.
db.raw.prepare("UPDATE notification_outbox SET attempt_count = 7 WHERE id = ?").run(configurationHoldId);
const firstConfigurationClaim = await claimNotificationOutboxDelivery(db, configurationHoldId, NOW);
assert.equal(firstConfigurationClaim.state, "claimed");
assert.equal(firstConfigurationClaim.delivery.attemptCount, 8, "claim still accounts for a real attempt before configuration is known");
assert.deepEqual(
  await retryNotificationOutboxDelivery(db, configurationHoldId, NOW + 1, {
    leaseToken: firstConfigurationClaim.delivery.leaseToken,
    delaySeconds: 900,
    hold: "configuration",
    error: "Web Push configuration is unavailable.",
  }),
  { state: "pending", id: configurationHoldId },
  "a fenced configuration hold returns a claimed delivery to pending instead of dead-lettering it",
);
let configurationHoldState = await getNotificationOutboxDeliveryState(db, configurationHoldId);
assert.equal(configurationHoldState.state, "pending");
assert.equal(configurationHoldState.attemptCount, 7, "a configuration hold refunds only the claim that discovered missing configuration");
assert.equal(configurationHoldState.availableAt, NOW + 901, "configuration holds honor their bounded retry delay");
assert.equal(
  (await claimNotificationOutboxDelivery(db, configurationHoldId, NOW + 900)).state,
  "not_due",
  "a configuration hold does not hot-loop while an operator restores secrets",
);
const secondConfigurationClaim = await claimNotificationOutboxDelivery(db, configurationHoldId, NOW + 901);
assert.equal(secondConfigurationClaim.state, "claimed", "a configuration-held delivery becomes eligible after its delay");
assert.equal(secondConfigurationClaim.delivery.attemptCount, 8, "the next held claim reaches the boundary again without exceeding it");
assert.equal(
  (await retryNotificationOutboxDelivery(db, configurationHoldId, NOW + 902, {
    leaseToken: secondConfigurationClaim.delivery.leaseToken,
    delaySeconds: 900,
    hold: "configuration",
    error: "Web Push configuration is unavailable.",
  })).state,
  "pending",
  "repeated configuration holds remain recoverable rather than consuming the retry cap",
);
configurationHoldState = await getNotificationOutboxDeliveryState(db, configurationHoldId);
assert.equal(configurationHoldState.attemptCount, 7, "repeated configuration holds preserve the prior genuine-attempt count");

const cappedTransient = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:transient-retry-cap",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Transient retry cap" },
  now: NOW,
});
const cappedTransientId = cappedTransient.createdIds[0];
await markNotificationOutboxQueued(db, cappedTransientId, NOW);
db.raw.prepare("UPDATE notification_outbox SET attempt_count = 7 WHERE id = ?").run(cappedTransientId);
const cappedTransientClaim = await claimNotificationOutboxDelivery(db, cappedTransientId, NOW);
assert.equal(cappedTransientClaim.state, "claimed");
assert.equal(
  (await retryNotificationOutboxDelivery(db, cappedTransientId, NOW + 1, {
    leaseToken: cappedTransientClaim.delivery.leaseToken,
    delaySeconds: 30,
    error: "Temporary push provider failure.",
  })).state,
  "dead",
  "ordinary transient retries retain the durable retry cap",
);

db.raw.prepare(
  `INSERT INTO quiz_assignments
    (id, team_id, title, items_json, question_types_json, custom_questions_json, quiz_mode, required_score, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, '[]', '[]', 'quick', 0, 'published', ?, ?)`,
).run("homework-1", "team-a", "Homework", "[]", NOW, NOW);
db.raw.prepare(
  "INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_at) VALUES (?, ?, ?)",
).run("homework-1", "active-player", NOW);
const homework = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "homework-1:assigned",
  deliveryKind: "quiz_homework",
  homeworkAssignmentId: "homework-1",
  recipientUserIds: ["active-player"],
  notification: { type: "quiz_homework", title: "Homework: Install" },
  now: NOW,
});
const homeworkId = homework.createdIds[0];
const assignedReceipt = db.raw.prepare(
  "SELECT assignment_id, user_id, event_type, notification_outbox_id FROM quiz_assignment_delivery_events WHERE notification_outbox_id = ?",
).get(homeworkId);
assert.equal(assignedReceipt.assignment_id, "homework-1", "new homework outbox writes its assignment receipt atomically");
assert.equal(assignedReceipt.user_id, "active-player");
assert.equal(assignedReceipt.event_type, "assigned");
assert.equal(assignedReceipt.notification_outbox_id, homeworkId, "homework receipt is keyed by the durable outbox id");
await markNotificationOutboxQueued(db, homeworkId, NOW);
db.raw.prepare("UPDATE quiz_assignments SET status = 'archived' WHERE id = 'homework-1'").run();
assert.equal(
  (await claimNotificationOutboxDelivery(db, homeworkId, NOW + 1)).state,
  "cancelled",
  "delivery-time homework revalidation cancels archived or unassigned work",
);
assert.equal(db.raw.prepare("SELECT state FROM notification_outbox WHERE id = ?").get(homeworkId).state, "cancelled");
assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM notifications WHERE id = ?").get(homeworkId).count, 0, "cancelled stale homework removes its bell entry");

db.raw.prepare(
  `INSERT INTO quiz_assignments
    (id, team_id, title, items_json, question_types_json, custom_questions_json, quiz_mode, required_score, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, '[]', '[]', 'quick', 0, 'published', ?, ?)`,
).run("homework-2", "team-a", "Reminder homework", "[]", NOW, NOW);
db.raw.prepare(
  "INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_at, notification_count) VALUES (?, ?, ?, 1)",
).run("homework-2", "active-player", NOW);
const reminder = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "homework-2:reminder:one",
  deliveryKind: "quiz_homework",
  homeworkAssignmentId: "homework-2",
  homeworkDeliveryEventType: "reminded",
  recipientUserIds: ["active-player"],
  notification: { type: "quiz_homework", title: "Reminder: Homework" },
  now: NOW + 2,
});
const reminderId = reminder.createdIds[0];
assert.equal(
  db.raw.prepare("SELECT notification_count FROM quiz_assignment_recipients WHERE assignment_id = 'homework-2' AND user_id = 'active-player'").get().notification_count,
  2,
  "a newly inserted reminder receipt increments the recipient count once",
);
const reminderReplay = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "homework-2:reminder:one",
  deliveryKind: "quiz_homework",
  homeworkAssignmentId: "homework-2",
  homeworkDeliveryEventType: "reminded",
  recipientUserIds: ["active-player"],
  notification: { type: "quiz_homework", title: "Replay must not count again" },
  now: NOW + 3,
});
assert.deepEqual(reminderReplay.existingIds, [reminderId], "duplicate reminder event returns the first durable outbox row");
assert.equal(
  db.raw.prepare("SELECT notification_count FROM quiz_assignment_recipients WHERE assignment_id = 'homework-2' AND user_id = 'active-player'").get().notification_count,
  2,
  "duplicate reminder event cannot increment the recipient count again",
);
assert.equal(
  db.raw.prepare("SELECT COUNT(*) AS count FROM quiz_assignment_delivery_events WHERE notification_outbox_id = ?").get(reminderId).count,
  1,
  "outbox-keyed unique receipt prevents duplicate reminder events",
);

db.raw.prepare(
  `INSERT INTO quiz_assignments
    (id, team_id, title, items_json, question_types_json, custom_questions_json, quiz_mode, required_score, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, '[]', '[]', 'quick', 0, 'published', ?, ?)`,
).run("homework-3", "team-a", "Deletion homework", "[]", NOW, NOW);
db.raw.prepare(
  "INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_at) VALUES (?, ?, ?)",
).run("homework-3", "active-player", NOW);
const deletedHomework = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "homework-3:assigned",
  deliveryKind: "quiz_homework",
  homeworkAssignmentId: "homework-3",
  recipientUserIds: ["active-player"],
  notification: { type: "quiz_homework", title: "Deleted homework" },
  now: NOW,
});
const deletedHomeworkId = deletedHomework.createdIds[0];
db.raw.prepare("DELETE FROM quiz_assignments WHERE id = 'homework-3'").run();
assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE id = ?").get(deletedHomeworkId).count, 0, "assignment deletion cascades its durable outbox row");
assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM notifications WHERE id = ?").get(deletedHomeworkId).count, 0, "outbox deletion trigger removes the stale deleted-homework bell record");

const stranded = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:stranded-lease",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Stranded lease" },
  now: NOW,
});
const strandedId = stranded.createdIds[0];
await markNotificationOutboxQueued(db, strandedId, NOW);
const strandedClaim = await claimNotificationOutboxDelivery(db, strandedId, NOW);
assert.equal(strandedClaim.state, "claimed");
const dueIds = await findDueNotificationOutboxIds(db, NOW + 121, 10);
assert.ok(dueIds.includes(strandedId), "expired leases become repairable opaque Queue ids");
assert.equal((await getNotificationOutboxDeliveryState(db, strandedId)).state, "pending", "repair scan returns abandoned work to pending");
assert.equal(
  (await cancelNotificationOutboxDelivery(db, strandedId, NOW + 121, "test_cancel")).state,
  "cancelled",
  "a non-claimed pending delivery can be cancelled safely",
);

const exhausted = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:expired-attempt-limit",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Expired retry cap" },
  now: NOW,
});
const exhaustedId = exhausted.createdIds[0];
await markNotificationOutboxQueued(db, exhaustedId, NOW);
assert.equal((await claimNotificationOutboxDelivery(db, exhaustedId, NOW)).state, "claimed");
db.raw.prepare(
  "UPDATE notification_outbox SET attempt_count = 8, lease_expires_at = ? WHERE id = ?",
).run(NOW + 1, exhaustedId);
const dueAfterAttemptLimit = await findDueNotificationOutboxIds(db, NOW + 2, 20);
assert.equal(dueAfterAttemptLimit.includes(exhaustedId), false, "expired rows at the durable retry cap are not re-enqueued forever");
assert.equal((await getNotificationOutboxDeliveryState(db, exhaustedId)).state, "dead", "expired retry-cap rows become terminal");

const staleQueued = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:stale-queue-publication",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Stale queue publication" },
  now: NOW,
});
const staleQueuedId = staleQueued.createdIds[0];
await markNotificationOutboxQueued(db, staleQueuedId, NOW);
assert.ok(
  (await findDueNotificationOutboxIds(db, NOW + 301, 10)).includes(staleQueuedId),
  "an unclaimed Queue publication is eventually repairable",
);
assert.equal(
  (await markNotificationOutboxQueued(db, staleQueuedId, NOW + 301)).queued,
  true,
  "a successful repair publication refreshes its queued timestamp",
);
assert.equal(
  (await findDueNotificationOutboxIds(db, NOW + 302, 10)).includes(staleQueuedId),
  false,
  "refreshed queued work is not needlessly replayed on the next sweep",
);

const expiredIneligible = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:expired-ineligible-lease",
  deliveryKind: "team_broadcast",
  recipientUserIds: ["active-player"],
  notification: { type: "team_update", title: "Expired ineligible lease" },
  now: NOW,
});
const expiredIneligibleId = expiredIneligible.createdIds[0];
await markNotificationOutboxQueued(db, expiredIneligibleId, NOW);
assert.equal((await claimNotificationOutboxDelivery(db, expiredIneligibleId, NOW)).state, "claimed");
db.raw.prepare("UPDATE users SET status = 'disabled' WHERE id = 'active-player'").run();
assert.equal(
  (await claimNotificationOutboxDelivery(db, expiredIneligibleId, NOW + 121)).state,
  "cancelled",
  "an expired lease with a newly ineligible recipient is cancelled instead of looping forever",
);
assert.equal(
  db.raw.prepare("SELECT state FROM notification_outbox WHERE id = ?").get(expiredIneligibleId).state,
  "cancelled",
  "expired ineligible lease transition is persisted",
);

const highFanoutRecipientIds = [];
for (let index = 0; index < 500; index += 1) {
  const id = `fanout-player-${index}`;
  seedUser(id);
  highFanoutRecipientIds.push(id);
}
db.calls.length = 0;
const highFanout = await createNotificationOutboxDeliveries(db, {
  teamId: "team-a",
  eventKey: "team-update:five-hundred-set-based",
  deliveryKind: "team_broadcast",
  recipientUserIds: highFanoutRecipientIds,
  notification: { type: "team_update", title: "500 player set-based fanout" },
  now: NOW,
});
assert.equal(highFanout.createdIds.length, 500, "set-based core fanout persists every eligible player intent");
assert.equal(
  db.calls.length,
  4,
  "a 500-player core fanout uses scope insert, set-based insert, scope read, and result read rather than per-player D1 queries",
);
assert.ok(
  db.calls.every((call) => call.values.length <= 100),
  "every set-based core statement remains below D1's 100-bound-parameter ceiling",
);
assert.ok(
  db.calls.some((call) => call.sql.includes("json_each(?)")),
  "large fanout uses SQLite json_each over one bounded JSON parameter",
);

db.raw.close();
console.log("notification outbox contract: atomic intents, opaque Queue payloads, leases, retries, and delivery revalidation verified");
