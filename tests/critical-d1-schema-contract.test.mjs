/**
 * The deployment preflight must verify the physical D1 schema, not merely its
 * migration ledger. This test uses an in-memory SQLite database only; it
 * never invokes Wrangler or a remote database.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  CRITICAL_D1_SCHEMA,
  criticalSchemaProbeSql,
  criticalSchemaProbeStatements,
  formatCriticalSchemaReport,
  parseD1ExecuteJson,
  verifyCriticalSchemaRows,
} from "../scripts/critical-d1-schema.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = path.join(root, "migrations");
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const probeSql = criticalSchemaProbeSql();
assert.match(probeSql, /^SELECT\s+'object'\s+AS\s+kind/im, "critical schema probe starts with metadata SELECT");
assert.match(probeSql, /FROM sqlite_master/, "critical schema probe reads sqlite_master");
assert.match(probeSql, /pragma_table_info\('authoritative_quiz_sessions'\)/, "critical schema probe reads authoritative session columns");
assert.match(probeSql, /pragma_table_info\('authoritative_quiz_questions'\)/, "critical schema probe reads authoritative question columns");
assert.match(probeSql, /pragma_table_info\('notification_outbox'\)/, "critical schema probe reads durable notification outbox columns");
assert.match(probeSql, /pragma_table_info\('quiz_assignment_delivery_events'\)/, "critical schema probe reads outbox-keyed homework receipt columns");
assert.match(probeSql, /pragma_table_info\('quiz_assignment_initial_notification_dispatches'\)/, "critical schema probe reads homework initial-dispatch recovery columns");
assert.match(probeSql, /pragma_index_info\('idx_login_attempts_attempted_at'\)/, "critical schema probe reads the login-ledger cleanup index definition");
assert.match(probeSql, /pragma_index_info\('idx_notification_outbox_event_recipient'\)/, "critical schema probe reads notification outbox idempotency index definition");
assert.match(probeSql, /pragma_index_info\('idx_quiz_assignment_delivery_events_outbox'\)/, "critical schema probe reads outbox-keyed homework receipt index definition");
assert.match(probeSql, /pragma_index_info\('idx_quiz_assignment_initial_dispatches_pending'\)/, "critical schema probe reads homework initial-dispatch repair index definition");
assert.match(probeSql, /pragma_index_info\('idx_authoritative_quiz_sessions_active_player'\)/, "critical schema probe reads the active-session index definition");
assert.doesNotMatch(probeSql, /\b(?:ALTER|CREATE|DELETE|DROP|INSERT|REPLACE|UPDATE|VACUUM)\b/i, "critical schema probe contains no write or DDL verb");

const migrations = (await readdir(migrationsDir))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
const db = new DatabaseSync(":memory:");
for (const migration of migrations) {
  db.exec(await readFile(path.join(migrationsDir, migration), "utf8"));
}

const localRows = criticalSchemaProbeStatements().flatMap((statement) => db.prepare(statement).all());
const freshSchemaResult = verifyCriticalSchemaRows(localRows);
assert.equal(freshSchemaResult.ok, true, formatCriticalSchemaReport(freshSchemaResult));
assert.equal(
  Object.keys(CRITICAL_D1_SCHEMA.tables).includes("authoritative_quiz_sessions"),
  true,
  "critical schema contract names the authoritative session table",
);
assert.equal(
  Object.keys(CRITICAL_D1_SCHEMA.indexes).includes("idx_authoritative_quiz_questions_unanswered"),
  true,
  "critical schema contract names the authoritative question index",
);
assert.equal(
  Object.keys(CRITICAL_D1_SCHEMA.indexes).includes("idx_login_attempts_attempted_at"),
  true,
  "critical schema contract names the login-ledger cleanup index",
);
assert.equal(
  Object.keys(CRITICAL_D1_SCHEMA.tables).includes("notification_outbox"),
  true,
  "critical schema contract names the durable notification outbox table",
);
assert.equal(
  Object.keys(CRITICAL_D1_SCHEMA.indexes).includes("idx_notification_outbox_event_recipient"),
  true,
  "critical schema contract names the notification outbox idempotency index",
);
assert.equal(
  Object.keys(CRITICAL_D1_SCHEMA.indexes).includes("idx_quiz_assignment_delivery_events_outbox"),
  true,
  "critical schema contract names the outbox-keyed homework receipt index",
);
assert.equal(
  Object.keys(CRITICAL_D1_SCHEMA.tables).includes("quiz_assignment_initial_notification_dispatches"),
  true,
  "critical schema contract names the durable homework initial-dispatch marker",
);
assert.equal(
  Object.keys(CRITICAL_D1_SCHEMA.indexes).includes("idx_quiz_assignment_initial_dispatches_pending"),
  true,
  "critical schema contract names the homework initial-dispatch repair index",
);

const parsedRemoteRows = parseD1ExecuteJson(JSON.stringify([{ success: true, results: localRows }]));
assert.equal(
  JSON.stringify(parsedRemoteRows),
  JSON.stringify(localRows),
  "the verifier accepts Wrangler D1 JSON without a remote request",
);

const missingIndexRows = localRows.filter((row) => !(
  row.kind === "object" && row.scope === "index" && row.name === "idx_authoritative_quiz_sessions_active_player"
));
const missingIndexResult = verifyCriticalSchemaRows(missingIndexRows);
assert.equal(missingIndexResult.ok, false, "a missing authoritative-session index fails closed");
assert.match(
  formatCriticalSchemaReport(missingIndexResult),
  /missing index idx_authoritative_quiz_sessions_active_player/,
  "the failure identifies the missing critical index",
);

const missingLoginCleanupIndexRows = localRows.filter((row) => !(
  row.kind === "object" && row.scope === "index" && row.name === "idx_login_attempts_attempted_at"
));
const missingLoginCleanupIndexResult = verifyCriticalSchemaRows(missingLoginCleanupIndexRows);
assert.equal(missingLoginCleanupIndexResult.ok, false, "a missing login-ledger cleanup index fails closed");
assert.match(
  formatCriticalSchemaReport(missingLoginCleanupIndexResult),
  /missing index idx_login_attempts_attempted_at/,
  "the failure identifies the missing login-ledger cleanup index",
);

const missingOutboxIndexRows = localRows.filter((row) => !(
  row.kind === "object" && row.scope === "index" && row.name === "idx_notification_outbox_event_recipient"
));
const missingOutboxIndexResult = verifyCriticalSchemaRows(missingOutboxIndexRows);
assert.equal(missingOutboxIndexResult.ok, false, "a missing notification outbox idempotency index fails closed");
assert.match(
  formatCriticalSchemaReport(missingOutboxIndexResult),
  /missing index idx_notification_outbox_event_recipient/,
  "the failure identifies the missing notification outbox index",
);

const missingOutboxReceiptIndexRows = localRows.filter((row) => !(
  row.kind === "object" && row.scope === "index" && row.name === "idx_quiz_assignment_delivery_events_outbox"
));
const missingOutboxReceiptIndexResult = verifyCriticalSchemaRows(missingOutboxReceiptIndexRows);
assert.equal(missingOutboxReceiptIndexResult.ok, false, "a missing outbox-keyed homework receipt index fails closed");
assert.match(
  formatCriticalSchemaReport(missingOutboxReceiptIndexResult),
  /missing index idx_quiz_assignment_delivery_events_outbox/,
  "the failure identifies the missing outbox-keyed homework receipt index",
);

const missingHomeworkDispatchIndexRows = localRows.filter((row) => !(
  row.kind === "object" && row.scope === "index" && row.name === "idx_quiz_assignment_initial_dispatches_pending"
));
const missingHomeworkDispatchIndexResult = verifyCriticalSchemaRows(missingHomeworkDispatchIndexRows);
assert.equal(missingHomeworkDispatchIndexResult.ok, false, "a missing homework initial-dispatch repair index fails closed");
assert.match(
  formatCriticalSchemaReport(missingHomeworkDispatchIndexResult),
  /missing index idx_quiz_assignment_initial_dispatches_pending/,
  "the failure identifies the missing homework initial-dispatch repair index",
);

const missingColumnRows = localRows.filter((row) => !(
  row.kind === "column" && row.scope === "authoritative_quiz_sessions" && row.name === "release_revision"
));
const missingColumnResult = verifyCriticalSchemaRows(missingColumnRows);
assert.equal(missingColumnResult.ok, false, "a missing release-pinning column fails closed");
assert.match(
  formatCriticalSchemaReport(missingColumnResult),
  /authoritative_quiz_sessions is missing column\(s\): release_revision/,
  "the failure identifies the missing authoritative column",
);

const [preflight, qualityGate] = await Promise.all([
  source("scripts/cloudflare-preflight.sh"),
  source("scripts/release-quality-gate.sh"),
]);
assert.match(preflight, /critical-d1-schema\.mjs --sql/, "deployment preflight builds the local read-only schema probe");
assert.match(preflight, /d1 execute "\$DATABASE_NAME" --remote --json[\s\\]*--command "\$critical_schema_probe_sql"/, "deployment preflight sends the schema probe through D1 execute read-only mode");
assert.match(preflight, /critical-d1-schema\.mjs --verify/, "deployment preflight verifies returned metadata before deployment");
assert.match(preflight, /sqlite_master\/PRAGMA metadata query/, "deployment preflight documents the metadata-only boundary");
assert.match(qualityGate, /node tests\/critical-d1-schema-contract\.test\.mjs/, "release quality gate runs the local critical-schema contract");

db.close();

console.log("critical D1 schema contract: fresh schema and read-only deployment probe verified");
