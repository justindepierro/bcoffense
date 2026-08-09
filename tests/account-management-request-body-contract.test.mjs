/**
 * Staff account-management writes must reject oversized or non-object request
 * bodies before parsing account fields. This supplements the shared request
 * body helper runtime contract with the three account-management call sites.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");

const routes = await Promise.all([
  source("functions/auth/invite.js"),
  source("functions/auth/players.js"),
  source("functions/auth/players/[id].js"),
]);

const expected = [
  ["invite", "MAX_INVITE_REQUEST_BYTES"],
  ["player creation", "MAX_PLAYER_CREATE_REQUEST_BYTES"],
  ["player action", "MAX_PLAYER_ACTION_REQUEST_BYTES"],
];
const expectedCaps = ["8 \\* 1024", "8 \\* 1024", "4 \\* 1024"];

routes.forEach((route, index) => {
  const [label, maxBytes] = expected[index];
  assert.match(route, /RequestBodyError, readBoundedJsonOrFormObject/, `${label} imports the bounded request parser`);
  assert.match(route, new RegExp(`const ${maxBytes} = ${expectedCaps[index]};`), `${label} has an explicit small body ceiling`);
  assert.match(
    route,
    new RegExp(`readBoundedJsonOrFormObject\\(request, \\{ maxBytes: ${maxBytes} \\}\\)`),
    `${label} preserves JSON/form compatibility through the bounded parser`,
  );
  assert.match(route, /error instanceof RequestBodyError && error\.status === 413/, `${label} returns an explicit 413 for oversized bodies`);
  assert.match(route, /error: "Invalid request body\."/, `${label} preserves the safe malformed-body response`);
  assert.doesNotMatch(route, /await request\.(?:json|formData)\(/, `${label} does not buffer the original request body without a limit`);
});

assert.match(routes[0], /function textField\([\s\S]*?typeof value !== "string"/, "invite rejects non-text identity fields instead of coercing them");
assert.match(routes[1], /function textField\([\s\S]*?typeof value !== "string"/, "player creation rejects non-text identity fields instead of coercing them");
assert.match(routes[0], /MAX_EMAIL_LENGTH = 254[\s\S]*?MAX_DISPLAY_NAME_LENGTH = 160[\s\S]*?MAX_NAME_PART_LENGTH = 80/, "invite declares compact identity field ceilings");
assert.match(routes[1], /MAX_EMAIL_LENGTH = 254[\s\S]*?MAX_DISPLAY_NAME_LENGTH = 160[\s\S]*?MAX_NAME_PART_LENGTH = 80[\s\S]*?MAX_ROLE_LENGTH = 16/, "player creation declares compact identity and role ceilings");
assert.match(routes[0], /text\.length > maxLength[\s\S]*?is too long/, "invite rejects oversized individual identity fields");
assert.match(routes[1], /text\.length > maxLength[\s\S]*?is too long/, "player creation rejects oversized individual identity fields");
assert.doesNotMatch(routes[0], /String\(body\.(?:email|displayName|firstName|lastName)/, "invite does not coerce identity fields through String()");
assert.doesNotMatch(routes[1], /String\(body\.(?:email|displayName|firstName|lastName|role)/, "player creation does not coerce account fields through String()");
assert.match(routes[2], /MAX_PLAYER_ACTION_LENGTH = 32/, "player actions have a compact action-name ceiling");
assert.match(routes[2], /typeof body\.action === "string"[\s\S]*?MAX_PLAYER_ACTION_LENGTH/, "player actions reject non-text or overlong action names");
assert.match(routes[2], /MAX_COACH_PERMISSION_ENTRIES = 32/, "coach access submissions cap permission entries");
assert.match(routes[2], /typeof source === "string"[\s\S]*?JSON\.parse\(source\)[\s\S]*?Array\.isArray\(source\)/, "coach access accepts the normal JSON permissions array and compatible form encoding");
assert.match(routes[2], /parseCoachPermissions\([\s\S]*?slice\(0, MAX_COACH_PERMISSION_ENTRIES\)[\s\S]*?typeof key === "string"/, "coach access bounds entries and filters them through the existing allowlist");

console.log("account-management request body contract: 31 assertions passed");
