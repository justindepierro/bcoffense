import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [endpoint, migration, middleware] = await Promise.all([
  read("functions/api/telemetry.js"),
  read("migrations/0032_telemetry_vitals.sql"),
  read("functions/_middleware.js"),
]);

// Endpoint: authenticated, bounded, numeric-clamped, no PII.
assert.match(endpoint, /export async function onRequestPost\(context\)/, "POST /api/telemetry handler");
assert.match(endpoint, /getSessionFromRequest\(request, env\)/, "requires an authenticated session");
assert.match(endpoint, /if \(!session\) return authJson\([^)]*status: 401/, "unauthenticated telemetry is rejected");
assert.match(endpoint, /readBoundedJsonObject\(request, \{ maxBytes: MAX_TELEMETRY_BODY_BYTES \}\)/, "reads a bounded JSON body");
assert.match(endpoint, /INSERT INTO telemetry_vitals/, "stores into telemetry_vitals");
assert.match(endpoint, /function numberOrNull\(value, min, max\)/, "clamps numeric vitals to a sane range");
assert.match(endpoint, /session\.role/, "derives role from the session, not the client");
assert.doesNotMatch(endpoint, /session\.username|d1_user_id|player_id/, "stores no per-user identity (no PII)");
assert.doesNotMatch(endpoint, /^\s*import[^\n]*from ["']\.\.\/_lib\/(?!auth|team-context|request-body)/m, "only depends on shared lib helpers");

// Migration: additive table + index.
assert.match(migration, /CREATE TABLE IF NOT EXISTS telemetry_vitals/, "migration creates telemetry_vitals");
assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_telemetry_vitals_received_at/, "indexes received_at for time queries");
assert.doesNotMatch(migration, /DROP TABLE(?! IF)|DELETE FROM|UPDATE /, "migration is additive (no destructive statements)");

// Middleware: telemetry is allowlisted for managed coaches (personal diagnostic write).
assert.match(middleware, /pathname === "\/api\/telemetry"\) return true/, "managed coaches may send telemetry");

console.log("telemetry endpoint contract: authenticated, bounded, no-PII vitals sink verified");
