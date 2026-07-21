import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");

const [migration, policy, auth, middleware, accounts, accountAction, client, authClient, shell, scriptPlayer, scriptRender, playbookRender, components, index, sw] = await Promise.all([
  source("migrations/0023_staff_access.sql"),
  source("functions/_lib/staff-access.js"),
  source("functions/_lib/auth.js"),
  source("functions/_middleware.js"),
  source("functions/auth/players.js"),
  source("functions/auth/players/[id].js"),
  source("js/coach-access.js"),
  source("js/auth.js"),
  source("js/app-shell.js"),
  source("js/script-player.js"),
  source("js/script-render.js"),
  source("js/playbook-render.js"),
  source("css/components.css"),
  source("index.html"),
  source("sw.js"),
]);

assert.match(migration, /CREATE TABLE IF NOT EXISTS staff_access/, "coach access has a durable D1 table");
assert.match(migration, /permissions_json TEXT NOT NULL/, "permissions are stored as explicit server records");
assert.match(policy, /DEFAULT_MANAGED_COACH_PERMISSIONS/, "managed coaches have a safe default profile");
assert.match(policy, /feature:edit_workspace/, "editing is an explicit capability rather than the default");
assert.match(policy, /"tab:gameplan"/, "managed coaches receive read-only game-plan access by default");
assert.match(auth, /staff_access\.permissions_json/, "sessions resolve the current server-side coach permissions");
assert.match(middleware, /canManagedCoachUseWriteRoute/, "middleware enforces managed coach write policy");
assert.match(middleware, /api\/questions/, "questions remain allowed in the default collaboration profile");
assert.match(accounts, /requestedRole/, "account endpoint can intentionally create a coach account");
assert.match(accounts, /INSERT INTO staff_access/, "new coach invitations receive the default access record");
assert.match(accountAction, /set-coach-access/, "admin can persist individual coach access changes");
assert.match(accountAction, /session\.role !== "admin"/, "only admin can change another coach's access");
assert.match(client, /Invite a Coach/, "admin UI can invite a managed coach");
assert.match(client, /Save access/, "admin UI exposes per-feature access checkboxes");
assert.match(client, /Read-only workspace/, "access UI distinguishes study access from write grants");
const cloudSync = await source("js/cloud-sync.js");
assert.match(cloudSync, /currentUser\.managedCoach === true/, "managed coaches hydrate from the canonical team workspace at sign-in");
assert.match(index, /id="coachAccessOverlay"/, "coach access modal is included in the app shell");
assert.match(index, /js\/coach-access\.js\?v=1304/, "coach access client is loaded");
assert.match(sw, /\.\/js\/coach-access\.js/, "coach access client is cached for offline shell use");
assert.match(authClient, /authStudyPortal/, "managed coaches are explicitly marked for the study-first portal");
assert.match(authClient, /STUDY_PORTAL_TABS/, "managed coaches are limited to the same core study tabs as players");
assert.match(shell, /isStudyPortal/, "managed coaches use the player-style mobile shell instead of the live coach shell");
assert.match(scriptPlayer, /_isScriptStudyPortalUser/, "published script launcher supports managed coach study access");
assert.match(scriptRender, /currentUser\?\.managedCoach === true/, "script rows use player study rendering for managed coaches");
assert.match(playbookRender, /currentUser\?\.managedCoach === true/, "playbook cards use player study rendering for managed coaches");
assert.match(components, /auth-study-portal/, "legacy mobile coach controls are hidden in the study portal");
assert.match(index, /id="mobileScriptCoachNow"[^>]*data-auth-admin-only="true"/, "unfinished live coach mode is reserved for admin");
assert.match(index, /id="mobileCoachDock"[^>]*data-auth-admin-only="true"/, "mobile coach dock is reserved for admin");

console.log("coach access contract: 28 assertions passed");
