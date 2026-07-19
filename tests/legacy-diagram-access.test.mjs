import { createSessionCookie } from "../functions/_lib/auth.js";
import { isPrimaryTeam } from "../functions/_lib/team-context.js";
import { onRequestPost as auditLegacy } from "../functions/images/audit-legacy.js";
import { onRequestPost as migrateLegacy } from "../functions/images/migrate-legacy.js";
import { onRequestPost as repairLegacy } from "../functions/images/repair-legacy.js";
import { onRequestGet as legacyPreview } from "../functions/images/legacy-preview.js";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeEnvironment(teamId, opts = {}) {
  const source = new TextEncoder().encode(opts.legacyBytes || "historic-diagram");
  const calls = { gets: [], puts: [] };
  const checksum = opts.checksum || "";
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes("FROM users")) {
                return {
                  role: "admin",
                  status: "active",
                  team_id: teamId,
                  sessions_invalid_before: null,
                };
              }
              if (sql.includes("FROM team_media_manifests")) {
                return opts.manifest || null;
              }
              return null;
            },
            async run() { return { success: true }; },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };
  const env = {
    AUTH_SESSION_SECRET: "legacy-diagram-test-session-secret",
    AUTH_PRIMARY_TEAM_ID: "team-a",
    DB: db,
    CLIPS: {
      async get(key) {
        calls.gets.push(key);
        return {
          body: {},
          size: source.byteLength,
          httpMetadata: { contentType: "image/webp" },
          async arrayBuffer() { return source.buffer.slice(0); },
        };
      },
      async put(key, bytes) {
        calls.puts.push({ key, size: bytes.byteLength });
        return { key, size: bytes.byteLength };
      },
    },
  };
  return { env, calls, source, checksum };
}

async function requestFor(env, body) {
  const sessionCookie = await createSessionCookie({
    username: "team-admin",
    role: "admin",
    label: "Admin",
    d1: true,
    d1_user_id: "team-admin-id",
  }, env);
  return new Request("https://bcoffense.test/images/legacy", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: sessionCookie.split(";")[0],
    },
    body: JSON.stringify(body),
  });
}

async function assertTeamBCannotRead(handler, body, label) {
  const { env, calls } = makeEnvironment("team-b");
  const response = await handler({ request: await requestFor(env, body), env });
  const payload = await response.json();
  assert(response.status === 403, `${label} denies a non-primary team admin`);
  assert(payload.ok === false, `${label} returns a denied result for Team B`);
  assert(calls.gets.length === 0 && calls.puts.length === 0, `${label} never touches legacy R2 for Team B`);
}

console.log("\n▸ Legacy diagram team boundary");
assert(await isPrimaryTeam({ AUTH_PRIMARY_TEAM_ID: "team-a" }, "team-a"), "recognizes the configured primary team");
assert(!(await isPrimaryTeam({ AUTH_PRIMARY_TEAM_ID: "team-a" }, "team-b")), "rejects a different team from legacy recovery");
assert(!(await isPrimaryTeam({}, "team-a")), "fails closed when no primary team is configured");

const checksum = "a".repeat(64);
await assertTeamBCannotRead(auditLegacy, {
  items: [{ mediaId: "play:team-b", sourceKey: "images/team-a-private-diagram" }],
}, "audit-legacy");
await assertTeamBCannotRead(migrateLegacy, {
  items: [{ mediaId: "play:team-b", sourceKey: "images/team-a-private-diagram", expectedLegacyChecksum: checksum }],
}, "migrate-legacy");
await assertTeamBCannotRead(repairLegacy, {
  mediaId: "play:team-b",
  sourceKey: "images/team-a-private-diagram",
  expectedCurrentChecksum: checksum,
  expectedLegacyChecksum: checksum,
}, "repair-legacy");
await assertTeamBCannotRead(legacyPreview, undefined, "legacy-preview");

const primaryChecksum = await sha256Hex("historic-diagram");
const primary = makeEnvironment("team-a", {
  manifest: {
    version: "old-version",
    r2_key: "media/teams/team-a/plays/play%3Ateam-a/diagram/old-version",
    checksum: primaryChecksum,
    size: 16,
    content_type: "image/webp",
  },
});
const primaryResponse = await auditLegacy({
  request: await requestFor(primary.env, {
    items: [{ mediaId: "play:team-a", sourceKey: "images/verified-legacy-diagram" }],
  }),
  env: primary.env,
});
const primaryPayload = await primaryResponse.json();
assert(primaryResponse.status === 200 && primaryPayload.results?.[0]?.status === "verified", "primary team can still reconcile verified legacy evidence");
assert(primary.calls.gets.length === 1 && primary.calls.gets[0] === "images/verified-legacy-diagram", "primary recovery reads only the requested legacy object");

if (failed) {
  console.error(`\n${failed} legacy diagram access assertion${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} legacy diagram access assertions passed.`);
}
