/**
 * Read-only contract for the D1 tables that protect authentication and
 * server-authoritative quiz scoring. The deploy preflight asks D1 for only
 * sqlite_master/PRAGMA metadata, then uses this module to fail closed when a
 * migration ledger says "applied" but the required physical schema is absent
 * or incomplete.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CRITICAL_D1_SCHEMA = Object.freeze({
  tables: Object.freeze({
    login_attempts: Object.freeze(["id", "ip_addr", "username", "success", "attempted_at"]),
    account_session_state: Object.freeze(["user_id", "invalid_before", "updated_at"]),
    account_session_epochs: Object.freeze(["user_id", "session_epoch", "updated_at"]),
    staff_access: Object.freeze(["user_id", "team_id", "permissions_json", "updated_at"]),
    player_quiz_attempts: Object.freeze(["id", "team_id", "user_id", "score_origin", "authoritative_session_id"]),
    player_reward_events: Object.freeze(["id", "team_id", "user_id", "reward_origin"]),
    player_helmet_stickers: Object.freeze(["id", "team_id", "user_id", "sticker_origin"]),
    authoritative_quiz_sessions: Object.freeze([
      "id", "team_id", "user_id", "player_name", "source_type", "source_id", "source_title",
      "release_revision", "start_key", "status", "question_count", "score", "total_points",
      "answered_count", "correct_count", "wrong_count", "percent", "date_key", "week_key",
      "attempt_id", "started_at", "expires_at", "completed_at", "updated_at",
    ]),
    authoritative_quiz_questions: Object.freeze([
      "session_id", "ordinal", "prompt_json", "choices_json", "correct_choice_id",
      "answered_choice_id", "answered_at", "is_correct",
    ]),
  }),
  indexes: Object.freeze({
    idx_login_attempts_ip: Object.freeze({ table: "login_attempts", columns: Object.freeze(["ip_addr", "attempted_at"]) }),
    idx_login_attempts_user: Object.freeze({ table: "login_attempts", columns: Object.freeze(["username", "attempted_at"]) }),
    idx_login_attempts_attempted_at: Object.freeze({ table: "login_attempts", columns: Object.freeze(["attempted_at"]) }),
    idx_account_session_state_invalid_before: Object.freeze({
      table: "account_session_state", columns: Object.freeze(["invalid_before"]),
    }),
    idx_staff_access_team_updated: Object.freeze({ table: "staff_access", columns: Object.freeze(["team_id", "updated_at"]) }),
    idx_player_quiz_attempts_authoritative_session: Object.freeze({
      table: "player_quiz_attempts",
      columns: Object.freeze(["team_id", "authoritative_session_id"]),
      unique: true,
      where: "where authoritative_session_id is not null",
    }),
    idx_player_quiz_attempts_verified_week: Object.freeze({
      table: "player_quiz_attempts", columns: Object.freeze(["team_id", "score_origin", "week_key"]),
    }),
    idx_player_reward_events_verified_week: Object.freeze({
      table: "player_reward_events", columns: Object.freeze(["team_id", "reward_origin", "week_key"]),
    }),
    idx_player_helmet_stickers_verified_week: Object.freeze({
      table: "player_helmet_stickers", columns: Object.freeze(["team_id", "sticker_origin", "week_key"]),
    }),
    idx_authoritative_quiz_sessions_active_player: Object.freeze({
      table: "authoritative_quiz_sessions",
      columns: Object.freeze(["team_id", "user_id"]),
      unique: true,
      where: "where status = 'active'",
    }),
    idx_authoritative_quiz_sessions_player_recent: Object.freeze({
      table: "authoritative_quiz_sessions", columns: Object.freeze(["team_id", "user_id", "started_at"]),
    }),
    idx_authoritative_quiz_questions_unanswered: Object.freeze({
      table: "authoritative_quiz_questions", columns: Object.freeze(["session_id", "answered_choice_id", "ordinal"]),
    }),
  }),
});

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeDefinition(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isExactList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * SELECT-only metadata statements suitable for `wrangler d1 execute --remote`.
 * `pragma_*` table-valued functions are SQLite metadata readers, not writes.
 * Keep them as separate statements: remote D1 limits the number of terms in
 * one compound SELECT, while Wrangler safely returns one result batch per
 * statement.
 */
export function criticalSchemaProbeStatements() {
  const tableNames = Object.keys(CRITICAL_D1_SCHEMA.tables);
  const indexNames = Object.keys(CRITICAL_D1_SCHEMA.indexes);
  const statements = [
    `SELECT 'object' AS kind, type AS scope, name, COALESCE(tbl_name, '') AS detail, COALESCE(sql, '') AS definition
       FROM sqlite_master
      WHERE (type = 'table' AND name IN (${tableNames.map(sqlString).join(", ")}))
         OR (type = 'index' AND name IN (${indexNames.map(sqlString).join(", ")}))`,
    ...tableNames.map((table) =>
      `SELECT 'column' AS kind, ${sqlString(table)} AS scope, name, '' AS detail, '' AS definition
         FROM pragma_table_info(${sqlString(table)})`,
    ),
    ...indexNames.map((index) =>
      `SELECT 'index_column' AS kind, ${sqlString(index)} AS scope, name, CAST(seqno AS TEXT) AS detail, '' AS definition
         FROM pragma_index_info(${sqlString(index)})`,
    ),
  ];
  return statements;
}

export function criticalSchemaProbeSql() {
  return `${criticalSchemaProbeStatements().join(";\n")};`;
}

/** Parse the JSON shape returned by `wrangler d1 execute --json`. */
export function parseD1ExecuteJson(input) {
  const payload = typeof input === "string" ? JSON.parse(input) : input;
  const batches = Array.isArray(payload) ? payload : [payload];
  if (!batches.length || !batches.every((batch) => batch && typeof batch === "object")) {
    throw new Error("D1 schema probe returned an invalid response.");
  }

  const rows = [];
  for (const batch of batches) {
    if (batch.success === false) {
      throw new Error("D1 schema probe reported an unsuccessful query.");
    }
    if (!Array.isArray(batch.results)) {
      throw new Error("D1 schema probe returned no result rows.");
    }
    rows.push(...batch.results);
  }
  return rows;
}

/** Verify all critical objects without ever mutating the inspected database. */
export function verifyCriticalSchemaRows(rows) {
  if (!Array.isArray(rows)) return { ok: false, issues: ["D1 schema probe rows are invalid."] };

  const objects = new Map();
  const columns = new Map();
  const indexColumns = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const kind = String(row.kind || "");
    const scope = String(row.scope || "");
    const name = String(row.name || "");
    if (!scope || !name) continue;
    if (kind === "object") objects.set(`${scope}:${name}`, row);
    if (kind === "column") {
      if (!columns.has(scope)) columns.set(scope, new Set());
      columns.get(scope).add(name);
    }
    if (kind === "index_column") {
      if (!indexColumns.has(scope)) indexColumns.set(scope, []);
      indexColumns.get(scope).push({ name, sequence: Number(row.detail) });
    }
  }

  const issues = [];
  for (const [table, requiredColumns] of Object.entries(CRITICAL_D1_SCHEMA.tables)) {
    if (!objects.has(`table:${table}`)) {
      issues.push(`missing table ${table}`);
      continue;
    }
    const actualColumns = columns.get(table) || new Set();
    const missingColumns = requiredColumns.filter((column) => !actualColumns.has(column));
    if (missingColumns.length) issues.push(`table ${table} is missing column(s): ${missingColumns.join(", ")}`);
  }

  for (const [index, expected] of Object.entries(CRITICAL_D1_SCHEMA.indexes)) {
    const object = objects.get(`index:${index}`);
    if (!object) {
      issues.push(`missing index ${index}`);
      continue;
    }
    if (String(object.detail || "") !== expected.table) {
      issues.push(`index ${index} is attached to ${String(object.detail || "unknown")}, expected ${expected.table}`);
    }
    const actualColumns = (indexColumns.get(index) || [])
      .sort((left, right) => left.sequence - right.sequence)
      .map((column) => column.name);
    if (!isExactList(actualColumns, expected.columns)) {
      issues.push(`index ${index} has columns (${actualColumns.join(", ") || "none"}), expected (${expected.columns.join(", ")})`);
    }
    const definition = normalizeDefinition(object.definition);
    if (expected.unique && !definition.startsWith("create unique index")) {
      issues.push(`index ${index} must be unique`);
    }
    if (expected.where && !definition.includes(expected.where)) {
      issues.push(`index ${index} is missing predicate ${expected.where}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

export function formatCriticalSchemaReport(result) {
  if (result?.ok) {
    return `Critical D1 schema probe passed: ${Object.keys(CRITICAL_D1_SCHEMA.tables).length} tables and ${Object.keys(CRITICAL_D1_SCHEMA.indexes).length} indexes match.`;
  }
  const issues = Array.isArray(result?.issues) && result.issues.length
    ? result.issues
    : ["unknown schema verification failure"];
  return `Critical D1 schema probe failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`;
}

async function runCli() {
  const command = process.argv[2];
  if (command === "--sql") {
    process.stdout.write(`${criticalSchemaProbeSql()}\n`);
    return;
  }
  if (command === "--verify") {
    let payload = "";
    for await (const chunk of process.stdin) payload += chunk;
    const result = verifyCriticalSchemaRows(parseD1ExecuteJson(payload));
    const report = formatCriticalSchemaReport(result);
    if (result.ok) process.stdout.write(`${report}\n`);
    else {
      process.stderr.write(`${report}\n`);
      process.exitCode = 1;
    }
    return;
  }
  process.stderr.write("Usage: node scripts/critical-d1-schema.mjs --sql | --verify\n");
  process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`Critical D1 schema probe failed: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
