import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");

const [migration, policy, auth, middleware, accounts, accountAction, client, index, sw] = await Promise.all([
  source("migrations/0023_staff_access.sql"),
  source("functions/_lib/staff-access.js"),
  source("functions/_lib/auth.js"),
  source("functions/_middleware.js"),
  source("functions/auth/players.js"),
  source("functions/auth/players/[id].js"),
  source("js/coach-access.js"),
  source("index.html"),
  source("sw.js"),
]);

assert.match(migration, /CREATE TABLE IF NOT EXISTS staff_access/, "coach access has a durable D1 table");
assert.match(migration, /permissions_json TEXT NOT NULL/, "permissions are stored as explicit server records");
assert.match(policy, /DEFAULT_MANAGED_COACH_PERMISSIONS/, "managed coaches have a safe default profile");
assert.match(policy, /feature:edit_workspace/, "editing is an explicit capability rather than the default");
assert.match(auth, /staff_access\.permissions_json/, "sessions resolve the current server-side coach permissions");
assert.match(middleware, /canManagedCoachUseWriteRoute/, "middleware enforces managed coach write policy");
assert.match(middleware, /api\/questions/, "questions remain allowed in the default collaboration profile");
assert.match(accounts, /requestedRole/, "account endpoint can intentionally create a coach account");
assert.match(accounts, /INSERT INTO staff_access/, "new coach invitations receive the default access record");
assert.match(accountAction, /set-coach-access/, "admin can persist individual coach access changes");
assert.match(accountAction, /session\.role !== "admin"/, "only admin can change another coach's access");
assert.match(client, /Invite a Coach/, "admin UI can invite a managed coach");
assert.match(client, /Save access/, "admin UI exposes per-feature access checkboxes");
assert.match(index, /id="coachAccessOverlay"/, "coach access modal is included in the app shell");
assert.match(index, /js\/coach-access\.js\?v=1281/, "coach access client is loaded");
assert.match(sw, /\.\/js\/coach-access\.js/, "coach access client is cached for offline shell use");

console.log("coach access contract: 16 assertions passed");
