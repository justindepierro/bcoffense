import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = path.join(root, "migrations");
const db = new DatabaseSync(":memory:");

const migrations = (await readdir(migrationsDir))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

for (const migration of migrations) {
  db.exec(await readFile(path.join(migrationsDir, migration), "utf8"));
}

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'login_attempts'",
).all();
assert.equal(tables.length, 1, "fresh schema must create login_attempts");

const now = Math.floor(Date.now() / 1000);
db.prepare(
  "INSERT INTO login_attempts (id, ip_addr, username, success, attempted_at) VALUES (?, ?, ?, ?, ?)",
).run("login-attempt-test", "203.0.113.10", "coach@example.test", 0, now);

const ipCount = db.prepare(
  "SELECT COUNT(*) AS n FROM login_attempts WHERE ip_addr = ? AND attempted_at > ?",
).get("203.0.113.10", now - 900);
const usernameCount = db.prepare(
  "SELECT COUNT(*) AS n FROM login_attempts WHERE username = ? AND attempted_at > ?",
).get("coach@example.test", now - 900);
assert.equal(ipCount.n, 1, "login IP rate-limit query must execute against a fresh schema");
assert.equal(usernameCount.n, 1, "login username rate-limit query must execute against a fresh schema");

const cleanupPlan = db.prepare(
  "EXPLAIN QUERY PLAN DELETE FROM login_attempts WHERE attempted_at < ?",
).all(now - 86400);
assert.ok(
  cleanupPlan.some((step) => /USING INDEX idx_login_attempts_attempted_at/i.test(String(step.detail || ""))),
  `fresh schema must index login-ledger cleanup by attempted_at: ${JSON.stringify(cleanupPlan)}`,
);

db.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").run(now - 86400);
db.close();

console.log("fresh schema login rate-limit contract passed");
