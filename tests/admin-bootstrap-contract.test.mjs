/**
 * Security contract for the named-admin migration bridge.
 *
 * This stays source-level because Cloudflare Pages Functions depend on D1 and
 * Web Crypto bindings that are not present in the plain Node unit runner. It
 * protects the critical authorization and query-shape invariants here.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [auth, bootstrap, accountActions, playersAdmin] = await Promise.all([
  source("functions/_lib/auth.js"),
  source("functions/auth/admin-bootstrap.js"),
  source("functions/auth/players/[id].js"),
  source("js/players-admin.js"),
]);

assert.match(
  auth,
  /export function isLegacyStaticStaffEnabled\(env\)[\s\S]*?AUTH_LEGACY_STATIC_STAFF_ENABLED[\s\S]*?!== "false"/,
  "legacy staff stays enabled by default and has an explicit false-only retirement switch",
);
assert.match(
  auth,
  /return !isLegacyStaticStaffUser\(user\) \|\| isLegacyStaticStaffEnabled\(env\);/,
  "the retirement switch applies to static admin/coach only, not the static player account",
);
assert.match(
  auth,
  /if \(!isEnabledStaticUser\(cleanUsername, env\)\) return null;/,
  "disabled legacy admin/coach credentials cannot create new sessions",
);
assert.match(
  auth,
  /&& isEnabledStaticUser\(session\.username, env\);/,
  "disabling legacy staff also invalidates already-issued static staff sessions",
);
assert.doesNotMatch(
  auth,
  /pathname === "\/auth\/admin-bootstrap"/,
  "admin bootstrap remains behind normal session middleware instead of becoming a public auth route",
);

assert.match(
  bootstrap,
  /function isLegacyAdminSession\(session\)[\s\S]*?session\?\.role === "admin"[\s\S]*?session\?\.username === "admin"[\s\S]*?!session\?\.d1UserId/,
  "only the current legacy shared admin, never a named D1 admin, can use bootstrap",
);
assert.match(
  bootstrap,
  /WHERE team_id = \?[\s\S]*?role = 'admin'[\s\S]*?LOWER\(email\) NOT IN \('admin@bcoffense\.internal', 'coach@bcoffense\.internal'\)/,
  "named-admin discovery is team-scoped and ignores synthetic legacy staff rows",
);
assert.match(
  bootstrap,
  /INSERT INTO users[\s\S]*?WHERE NOT EXISTS \([\s\S]*?team_id = \?[\s\S]*?role = 'admin'[\s\S]*?LOWER\(email\) NOT IN \('admin@bcoffense\.internal', 'coach@bcoffense\.internal'\)/,
  "the first-admin insert is conditional and race-safe within the current team",
);
assert.match(
  bootstrap,
  /createVerificationToken\(env\.DB, user\.id, "invitation", INVITATION_TTL_SECONDS\)/,
  "the first named admin receives a standard one-time invitation token",
);
assert.match(
  bootstrap,
  /UPDATE users SET updated_at = \?[\s\S]*?role = 'admin' AND status = 'invited'[\s\S]*?RESEND_COOLDOWN_SECONDS/,
  "a pending first-admin invite can be safely reissued without creating another account",
);
assert.match(
  bootstrap,
  /includePendingInvite[\s\S]*?payload\.pendingInvite = pending[\s\S]*?email: namedAdmins\[0\]\.email[\s\S]*?status: namedAdmins\[0\]\.status/,
  "legacy-admin status exposes the pending invitation needed for recovery",
);
assert.match(
  bootstrap,
  /emailSent: emailResult\.ok === true,[\s\S]*?inviteSent: emailResult\.ok === true,[\s\S]*?inviteUrl: emailResult\.ok === true \? undefined : inviteUrl/,
  "mail failures return the one-time link to the authenticated legacy admin instead of causing bootstrap lockout",
);
assert.match(
  bootstrap,
  /readBoundedJsonOrFormObject\(request, \{ maxBytes: MAX_ADMIN_BOOTSTRAP_BODY_BYTES \}\)/,
  "a bounded JSON-or-form reader rejects malformed primitives before account fields are read",
);

const adminGuard = accountActions.indexOf('if (user.role === "admin")');
const firstMutation = accountActions.indexOf('if (action === "set-coach-access")');
assert.ok(adminGuard >= 0 && adminGuard < firstMutation, "all player-management mutations are blocked before an admin target can be acted on");
assert.match(
  accountActions,
  /if \(user\.role === "admin"\) \{[\s\S]*?Administrator accounts cannot be changed through player management\./,
  "no direct player-management action can disable or otherwise mutate a named admin",
);
assert.match(
  accountActions,
  /if \(session\.managedCoach && user\.role !== "player"\)/,
  "managed coaches cannot mutate peer staff accounts",
);

assert.match(
  playersAdmin,
  /_adminBootstrapStatus\?\.pendingInvite\?\.email/,
  "the admin screen reads the server-authorized pending invite for recovery",
);
assert.match(
  playersAdmin,
  /data-admin-bootstrap="resend-pending"[\s\S]*?Send a fresh invitation/,
  "a pending named-admin invitation has an explicit recovery action",
);
assert.match(
  playersAdmin,
  /reissuePending \? \{ email \} : \{ email, displayName \}/,
  "the recovery action submits only the existing pending email and cannot alter the first admin identity",
);

console.log("admin bootstrap contract: 19 assertions passed");
