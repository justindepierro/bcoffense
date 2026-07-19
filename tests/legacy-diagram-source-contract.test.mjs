/**
 * Legacy diagram source-key contract.
 *
 * Historic R2 sources must be copied only from an exact allowlisted key. This
 * runs the real recovery endpoints against an in-memory D1/R2 surface so a
 * `media/plays/...` diagram cannot be accidentally prefixed as `images/...`,
 * and source evidence is never deleted.
 */

import { createSessionCookie } from "../functions/_lib/auth.js";
import { readFileSync } from "node:fs";
import { normalizeLegacyDiagramSourceKey } from "../functions/_lib/legacy-image-source.js";
import { onRequestPost as auditLegacy } from "../functions/images/audit-legacy.js";
import { onRequestPost as migrateLegacy } from "../functions/images/migrate-legacy.js";
import { onRequestPost as repairLegacy } from "../functions/images/repair-legacy.js";
import { onRequestGet as legacyPreview } from "../functions/images/legacy-preview.js";
import { onRequestGet as inventoryMedia } from "../functions/media/inventory.js";

const TEAM_ID = "team-a";
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

function makeEnvironment(options = {}) {
  const sourceKey = options.sourceKey || "media/plays/archive/diagram-42.webp";
  const sourceBytes = new TextEncoder().encode(options.sourceText || "legacy-diagram-source");
  const calls = { gets: [], puts: [], deletes: [], lists: [], dbWrites: [] };
  const current = options.currentManifest || null;
  const duplicateChecksumOwner = options.duplicateChecksumOwner || null;
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("checksum = ?")) return duplicateChecksumOwner;
              if (sql.includes("FROM team_media_manifests")) return current;
              return null;
            },
            async run() {
              calls.dbWrites.push({ sql, args });
              return { meta: { changes: 1 } };
            },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };
  const bucket = {
    async get(key) {
      calls.gets.push(key);
      if (key !== sourceKey) return null;
      return {
        body: {},
        size: sourceBytes.byteLength,
        httpMetadata: { contentType: "image/webp" },
        async arrayBuffer() { return sourceBytes.buffer.slice(0); },
      };
    },
    async put(key, bytes, optionsForPut = {}) {
      calls.puts.push({ key, size: bytes.byteLength, options: optionsForPut });
      return { key, size: bytes.byteLength };
    },
    async delete(key) {
      calls.deletes.push(key);
    },
    async list({ prefix }) {
      calls.lists.push(prefix);
      const objects = (options.inventoryObjects || [])
        .filter((item) => String(item.key || "").startsWith(prefix));
      return { objects, truncated: false, cursor: undefined };
    },
  };
  const store = {
    async get() { return null; },
    async list() { return { keys: [], list_complete: true, cursor: undefined }; },
  };
  return {
    env: {
      AUTH_SESSION_SECRET: "legacy-source-contract-session-secret",
      AUTH_PRIMARY_TEAM_ID: TEAM_ID,
      DB: db,
      CLIPS: bucket,
      SYNC_KV: store,
    },
    calls,
    sourceKey,
    sourceBytes,
  };
}

// An exact archived key is still unsafe when the checksum proves its bytes
// already belong to a different canonical play. Historic aliases caused this
// exact failure mode; retain the archive for review instead of duplicating a
// known-wrong diagram onto the requested media ID.
{
  const sourceText = "RIFF0000WEBPduplicate-canonical-content";
  const checksum = await sha256Hex(sourceText);
  const { env, calls, sourceKey } = makeEnvironment({
    sourceText,
    duplicateChecksumOwner: { media_id: "play:correct-owner" },
  });
  const response = await migrateLegacy({
    request: await adminRequest(env, "/images/migrate-legacy", "POST", {
      items: [{ mediaId: "play:wrong-alias", sourceKey, expectedLegacyChecksum: checksum }],
    }),
    env,
  });
  const payload = await response.json();
  assert(response.status === 200 && payload.results?.[0]?.status === "duplicate-canonical-content", "migration rejects legacy bytes already owned by another canonical play");
  assert(payload.results?.[0]?.canonicalChecksumOwner === "play:correct-owner", "migration identifies the existing canonical checksum owner");
  assert(calls.puts.length === 0 && calls.deletes.length === 0, "duplicate canonical content never creates or deletes media objects");
}

async function adminRequest(env, path, method, body) {
  const sessionCookie = await createSessionCookie({
    username: "admin",
    role: "admin",
    label: "Admin",
  }, env);
  const init = {
    method,
    headers: {
      Accept: "application/json",
      Cookie: sessionCookie.split(";")[0],
    },
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return new Request(`https://bcoffense.test${path}`, init);
}

async function adminGetRequest(env, path) {
  const sessionCookie = await createSessionCookie({ username: "admin", role: "admin", label: "Admin" }, env);
  return new Request(`https://bcoffense.test${path}`, {
    headers: { Cookie: sessionCookie.split(";")[0] },
  });
}

console.log("\n▸ Legacy diagram full-source-key contract");

assert(normalizeLegacyDiagramSourceKey("images/historic-call") === "images/historic-call", "allows an exact images/ source key");
assert(normalizeLegacyDiagramSourceKey("media/plays/archive/diagram-42.webp") === "media/plays/archive/diagram-42.webp", "allows an exact media/plays/ source key");
assert(!normalizeLegacyDiagramSourceKey("historic-call"), "rejects a bare source fragment");
assert(!normalizeLegacyDiagramSourceKey("images/../private"), "rejects dot-segment traversal");
assert(!normalizeLegacyDiagramSourceKey("media/plays/%2e%2e/private"), "rejects encoded traversal");
assert(!normalizeLegacyDiagramSourceKey("/images/historic-call"), "rejects an absolute-looking source key");

const inventoryClientSource = readFileSync(new URL("../js/media-inventory.js", import.meta.url), "utf8");
assert(inventoryClientSource.includes("entry?.sourceKey || entry?.key"), "inventory reconciliation carries the full server source key forward");
assert(!inventoryClientSource.includes('replace(/^images\\//, "")'), "inventory never strips an images/ prefix before recovery");
assert(inventoryClientSource.includes("data-recovery-target-search"), "recovery play selector has a searchable narrowing control");
assert(inventoryClientSource.includes("targetQueries"), "recovery selector keeps search state separate from the selected mapping");

// Preview is admin-only recovery evidence: it reads one exact key, validates
// image bytes, and exposes the checksum that the migration must verify again.
{
  const sourceText = "RIFF0000WEBPpreview-media-plays";
  const checksum = await sha256Hex(sourceText);
  const { env, calls, sourceKey } = makeEnvironment({ sourceText });
  const response = await legacyPreview({
    request: await adminGetRequest(env, `/images/legacy-preview?sourceKey=${encodeURIComponent(sourceKey)}`),
    env,
  });
  assert(response.status === 200, "preview serves an exact archived media/plays image to an admin");
  assert(response.headers.get("X-BC-Legacy-Checksum") === checksum, "preview returns the checksum required for migration");
  assert(JSON.stringify(calls.gets) === JSON.stringify([sourceKey]), "preview reads the exact archived source key");
}

// Audit must read the supplied media/plays key verbatim and return it for the
// checksum-gated decision that follows.
{
  const sourceText = "RIFF0000WEBPaudit-media-plays";
  const checksum = await sha256Hex(sourceText);
  const { env, calls, sourceKey, sourceBytes } = makeEnvironment({
    sourceText,
    currentManifest: {
      version: "current-version",
      r2_key: "media/teams/team-a/plays/play%3A42/diagram/current-version",
      size: sourceText.length,
      content_type: "image/webp",
      checksum,
      uploaded_at: "2026-07-18T00:00:00.000Z",
      uploaded_by: "admin",
    },
  });
  const response = await auditLegacy({
    request: await adminRequest(env, "/images/audit-legacy", "POST", {
      items: [{ mediaId: "play:42", sourceKey }],
    }),
    env,
  });
  const payload = await response.json();
  assert(response.status === 200 && payload.results?.[0]?.status === "verified", "audit checksum-verifies a media/plays source");
  assert(payload.results?.[0]?.sourceKey === sourceKey, "audit returns the full source key unchanged");
  assert(JSON.stringify(calls.gets) === JSON.stringify([sourceKey]), "audit reads the exact media/plays key without an images prefix");
  assert(calls.deletes.length === 0 && sourceBytes.byteLength > 0, "audit never deletes archived source bytes");
}

// Migration copies a checksum-verified media/plays object to a new canonical
// key but does not remove its archived source.
{
  const sourceText = "RIFF0000WEBPmigrate-media-plays";
  const checksum = await sha256Hex(sourceText);
  const { env, calls, sourceKey } = makeEnvironment({ sourceText });
  const response = await migrateLegacy({
    request: await adminRequest(env, "/images/migrate-legacy", "POST", {
      items: [{ mediaId: "play:43", sourceKey, expectedLegacyChecksum: checksum }],
    }),
    env,
  });
  const payload = await response.json();
  assert(response.status === 200 && payload.results?.[0]?.status === "migrated", "migration accepts a checksum-verified media/plays source");
  assert(payload.results?.[0]?.sourceKey === sourceKey, "migration preserves the full source key in its result");
  assert(JSON.stringify(calls.gets) === JSON.stringify([sourceKey]), "migration copies from the exact full source key");
  assert(calls.puts[0]?.options?.customMetadata?.migratedFrom === sourceKey, "migration records the full source key in canonical metadata");
  assert(calls.deletes.length === 0, "migration never deletes the historic source object");
}

// Repair applies the same full-key and checksum rules when superseding a bad
// canonical pointer.
{
  const sourceText = "RIFF0000WEBPrepair-media-plays";
  const sourceChecksum = await sha256Hex(sourceText);
  const currentChecksum = await sha256Hex("wrong-canonical-version");
  const { env, calls, sourceKey } = makeEnvironment({
    sourceText,
    currentManifest: {
      version: "old-version",
      r2_key: "media/teams/team-a/plays/play%3A44/diagram/old-version",
      size: 1,
      content_type: "image/webp",
      checksum: currentChecksum,
      uploaded_at: "2026-07-18T00:00:00.000Z",
      uploaded_by: "admin",
    },
  });
  const response = await repairLegacy({
    request: await adminRequest(env, "/images/repair-legacy", "POST", {
      mediaId: "play:44",
      sourceKey,
      expectedCurrentChecksum: currentChecksum,
      expectedLegacyChecksum: sourceChecksum,
    }),
    env,
  });
  const payload = await response.json();
  assert(response.status === 200 && payload.ok, "repair accepts a checksum-verified media/plays source");
  assert(payload.sourceKey === sourceKey && payload.repairedFrom === sourceKey, "repair returns the full source key unchanged");
  assert(calls.puts[0]?.options?.customMetadata?.repairedFrom === sourceKey, "repair records the full source key in canonical metadata");
  assert(calls.deletes.length === 0, "repair never deletes the historic source object");
}

// Unsafe input cannot reach R2, even if the request otherwise has valid
// checksums and admin authorization.
{
  const checksum = await sha256Hex("unsafe-source");
  const { env, calls } = makeEnvironment();
  const response = await migrateLegacy({
    request: await adminRequest(env, "/images/migrate-legacy", "POST", {
      items: [{ mediaId: "play:unsafe", sourceKey: "images/../private", expectedLegacyChecksum: checksum }],
    }),
    env,
  });
  const payload = await response.json();
  assert(response.status === 200 && payload.results?.[0]?.status === "invalid", "migration rejects an unsafe source key");
  assert(calls.gets.length === 0 && calls.puts.length === 0 && calls.deletes.length === 0, "unsafe migration input never touches R2");
}

// Inventory exposes the full recovery source key, so the reconciliation UI
// never has to reconstruct it by guessing an images/ prefix.
{
  const sourceKey = "media/plays/archive/inventory-diagram.webp";
  const { env } = makeEnvironment({
    inventoryObjects: [{
      key: sourceKey,
      size: 42,
      httpMetadata: { contentType: "image/webp" },
      uploaded: new Date("2026-07-18T00:00:00.000Z"),
    }],
  });
  const response = await inventoryMedia({
    request: await adminRequest(env, "/media/inventory", "GET"),
    env,
  });
  const payload = await response.json();
  const item = payload.diagrams?.objects?.find((entry) => entry.key === sourceKey);
  assert(response.status === 200 && item?.sourceKey === sourceKey, "inventory preserves the full media/plays recovery key");
}

if (failed) {
  console.error(`\n${failed} legacy diagram source-key assertion${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} legacy diagram source-key assertions passed.`);
}
