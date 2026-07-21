// One-way, recovery-safe migration of historic signal manifests.
//
// Old signal clips were stored under globally named KV keys (`clips:signals/*`)
// and R2 objects (`clips/<id>`). New team media must use a team-scoped KV
// manifest and immutable R2 object. This endpoint copies verified bytes first,
// then makes the canonical manifest the commit point. Legacy manifests/objects
// are deliberately retained as recovery evidence.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { getPrimaryTeamId, resolveSessionTeamId } from "../_lib/team-context.js";
import { readTeamClipManifest, writeTeamClipManifest } from "../_lib/team-workspace.js";

const LEGACY_PREFIX = "clips:signals/";
const LEGACY_OBJECT_PREFIX = "clips/";
const MAX_MIGRATIONS_PER_REQUEST = 8;
const SAFE_ENTRY_ID = /^[a-z0-9_-]{1,160}$/i;

function canonicalClipR2Key(teamId, id) {
  return `media/teams/${encodeURIComponent(String(teamId || "").trim())}/clips/${encodeURIComponent(id)}`;
}

function isAdmin(session) {
  return String(session?.role || "") === "admin";
}

function cleanText(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

async function listLegacySignalSigs(store) {
  const sigs = [];
  let cursor;
  for (let pageCount = 0; pageCount < 20; pageCount += 1) {
    const page = await store.list({ prefix: LEGACY_PREFIX, cursor, limit: 1000 });
    (page.keys || []).forEach((key) => {
      const sig = String(key?.name || "").slice("clips:".length);
      if (sig.startsWith("signals/") && sig.length <= 400) sigs.push(sig);
    });
    if (page.list_complete !== false || !page.cursor) break;
    cursor = page.cursor;
  }
  return [...new Set(sigs)].sort();
}

function legacyEntrySourceKey(entry) {
  const id = cleanText(entry?.id, 160);
  const key = cleanText(entry?.r2key, 700) || (id ? `${LEGACY_OBJECT_PREFIX}${id}` : "");
  if (!SAFE_ENTRY_ID.test(id) || !key.startsWith(LEGACY_OBJECT_PREFIX)) return "";
  return key;
}

async function copyLegacyEntry(bucket, teamId, entry) {
  const id = cleanText(entry?.id, 160);
  const sourceKey = legacyEntrySourceKey(entry);
  if (!id || !sourceKey) throw new Error("Legacy signal clip entry is unsafe.");
  const destinationKey = canonicalClipR2Key(teamId, id);
  const source = await bucket.get(sourceKey);
  if (!source?.body || !Number(source.size || 0)) throw new Error("Legacy signal bytes are unavailable.");

  const existing = await bucket.head(destinationKey);
  if (existing && Number(existing.size || 0) !== Number(source.size || 0)) {
    throw new Error("Canonical signal destination does not match the verified legacy bytes.");
  }
  if (!existing) {
    await bucket.put(destinationKey, source.body, {
      httpMetadata: { contentType: source.httpMetadata?.contentType || cleanText(entry?.contentType, 160) || "video/mp4" },
      customMetadata: {
        migratedFrom: sourceKey,
        legacyId: id,
        kind: "signal-clip",
      },
    });
  }
  const verified = await bucket.head(destinationKey);
  if (!verified || Number(verified.size || 0) !== Number(source.size || 0)) {
    throw new Error("Canonical signal copy could not be verified.");
  }
  return {
    id,
    r2key: destinationKey,
    label: cleanText(entry?.label, 120),
    contentType: source.httpMetadata?.contentType || cleanText(entry?.contentType, 160) || "video/mp4",
    size: Number(verified.size || 0),
    duration: Math.max(0, Number(entry?.duration || 0) || 0),
    uploadedAt: cleanText(entry?.uploadedAt, 80),
    uploadedBy: cleanText(entry?.uploadedBy, 160),
  };
}

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!isAdmin(session)) return authJson({ ok: false, error: "Admin access is required." }, { status: 403 });
  const teamId = await resolveSessionTeamId(session, context.env);
  const primaryTeamId = await getPrimaryTeamId(context.env);
  if (!teamId || teamId !== primaryTeamId) {
    return authJson({ ok: false, error: "Legacy media migration is only available to the configured primary team." }, { status: 403 });
  }
  const store = context.env?.SYNC_KV;
  const bucket = context.env?.CLIPS;
  if (!store || !bucket) return authJson({ ok: false, error: "Cloud media storage is not configured." }, { status: 503 });

  try {
    const sigs = await listLegacySignalSigs(store);
    const migrated = [];
    const skipped = [];
    const failed = [];
    for (const sig of sigs) {
      if (migrated.length >= MAX_MIGRATIONS_PER_REQUEST) break;
      const canonical = await readTeamClipManifest(store, context.env, teamId, sig);
      // A canonical manifest (including a deletion tombstone) always wins and
      // must never be overwritten by historic evidence.
      if (!canonical.legacy) {
        skipped.push(sig);
        continue;
      }
      const legacyEntries = Array.isArray(canonical.entries) ? canonical.entries : [];
      if (!legacyEntries.length) {
        skipped.push(sig);
        continue;
      }
      try {
        const copied = [];
        for (const entry of legacyEntries) copied.push(await copyLegacyEntry(bucket, teamId, entry));
        await writeTeamClipManifest(store, teamId, sig, copied);
        migrated.push(sig);
      } catch (_err) {
        // Keep the legacy manifest untouched and report only the stable signal
        // key; raw error details can expose object topology unnecessarily.
        failed.push(sig);
      }
    }
    const remaining = sigs.filter((sig) => !migrated.includes(sig) && !skipped.includes(sig)).length;
    return authJson({
      ok: true,
      migrated,
      skipped: skipped.length,
      failed,
      remaining,
      complete: remaining === 0,
    });
  } catch (_err) {
    return authJson({ ok: false, error: "Legacy signal migration could not be completed." }, { status: 502 });
  }
}
