// One-way, recovery-safe migration of historic play-video manifests.
//
// Earlier builds stored play clips under display-derived keys such as
// `clips:Rip|Nail|Yellow|Run Option`. That is not a durable media identity:
// a later edit or duplicate play call can make it ambiguous. This route uses
// the current immutable workspace revision to map an old key to exactly one
// permanent `play:<id>` media ID. It copies and verifies bytes first, commits
// the permanent manifest, then writes a tombstone at the old key. Historic KV
// and R2 data are intentionally retained as recovery evidence.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { getPrimaryTeamId, resolveSessionTeamId } from "../_lib/team-context.js";
import { readTeamClipManifest, writeTeamClipManifest } from "../_lib/team-workspace.js";
import { readCurrentWorkspaceRevision } from "../_lib/workspace-revisions.js";

const LEGACY_MANIFEST_PREFIX = "clips:";
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

function legacyPlaySig(play) {
  return [play?.formation, play?.play, play?.personnel, play?.type]
    .map((value) => cleanText(value, 400))
    .join("|");
}

function permanentMediaId(play) {
  const existing = cleanText(play?.mediaId, 512);
  if (existing) return existing;
  const sourceId = [play?.playbookId, play?.sourcePlayId, play?.originalPlayId, play?.id]
    .map((value) => cleanText(value, 512))
    .find(Boolean) || "";
  return sourceId ? `play:${sourceId}` : "";
}

function readJson(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch (_err) { return fallback; }
}

function targetsFromWorkspace(workspace) {
  const rawPlaybook = readJson(workspace?.playbook, []);
  const playbook = Array.isArray(rawPlaybook) ? rawPlaybook : [];
  const targets = new Map();
  playbook.forEach((play) => {
    if (!play || play.isSeparator) return;
    const sig = legacyPlaySig(play);
    const mediaId = permanentMediaId(play);
    if (!sig || !mediaId) return;
    const current = targets.get(sig);
    if (!current) targets.set(sig, { mediaId, ambiguous: false });
    else if (current.mediaId !== mediaId) targets.set(sig, { mediaId: "", ambiguous: true });
  });
  return targets;
}

async function readCurrentWorkspace(env, bucket, teamId) {
  const current = await readCurrentWorkspaceRevision(env, bucket, teamId);
  if (!current?.payload || !current?.metadata) throw new Error("The current team workspace is unavailable.");
  const workspace = readJson(await current.payload.text(), null);
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    throw new Error("The current team workspace is invalid.");
  }
  return workspace;
}

async function listLegacyPlaySigs(store) {
  const sigs = [];
  let cursor;
  for (let pageCount = 0; pageCount < 20; pageCount += 1) {
    const page = await store.list({ prefix: LEGACY_MANIFEST_PREFIX, cursor, limit: 1000 });
    (page.keys || []).forEach((key) => {
      const sig = String(key?.name || "").slice(LEGACY_MANIFEST_PREFIX.length);
      if (sig && !sig.startsWith("signals/") && sig.length <= 400) sigs.push(sig);
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
  if (!id || !sourceKey) throw new Error("Legacy play clip entry is unsafe.");
  const destinationKey = canonicalClipR2Key(teamId, id);
  const source = await bucket.get(sourceKey);
  if (!source?.body || !Number(source.size || 0)) throw new Error("Legacy play clip bytes are unavailable.");
  const existing = await bucket.head(destinationKey);
  const sourceEtag = cleanText(source.etag, 160);
  const existingSource = cleanText(existing?.customMetadata?.migratedFrom, 700);
  const existingEtag = cleanText(existing?.customMetadata?.legacyEtag, 160);
  if (existing && (
    Number(existing.size || 0) !== Number(source.size || 0)
    || existingSource !== sourceKey
    || existingEtag !== sourceEtag
  )) {
    throw new Error("Canonical play clip destination does not prove the same legacy source.");
  }
  if (!existing) {
    await bucket.put(destinationKey, source.body, {
      httpMetadata: { contentType: source.httpMetadata?.contentType || cleanText(entry?.contentType, 160) || "video/mp4" },
      customMetadata: { migratedFrom: sourceKey, legacyEtag: sourceEtag, legacyId: id, kind: "play-clip" },
    });
  }
  const verified = await bucket.head(destinationKey);
  if (!verified
    || Number(verified.size || 0) !== Number(source.size || 0)
    || cleanText(verified.customMetadata?.migratedFrom, 700) !== sourceKey
    || cleanText(verified.customMetadata?.legacyEtag, 160) !== sourceEtag) {
    throw new Error("Canonical play clip copy could not be verified.");
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

async function migrateLegacyPlayManifests(store, bucket, env, teamId) {
  const [sigs, workspace] = await Promise.all([
    listLegacyPlaySigs(store),
    readCurrentWorkspace(env, bucket, teamId),
  ]);
  const targets = targetsFromWorkspace(workspace);
  const migrated = [];
  const retired = [];
  const inactive = [];
  const skipped = [];
  const failed = [];
  for (const sig of sigs) {
    if (migrated.length + retired.length >= MAX_MIGRATIONS_PER_REQUEST) break;
    const legacy = await readTeamClipManifest(store, env, teamId, sig);
    if (!legacy.legacy) {
      // The old KV key remains as recovery evidence, but its team-scoped
      // tombstone means it can no longer be resolved by normal runtime code.
      inactive.push(sig);
      continue;
    }
    const target = targets.get(sig);
    // An unlinked or ambiguous display-derived key cannot safely reach a
    // current player release. Tombstone the active fallback, while retaining
    // the historic KV and R2 objects for a future recovery decision.
    if (!target || target.ambiguous || !target.mediaId) {
      await writeTeamClipManifest(store, teamId, sig, []);
      retired.push(sig);
      continue;
    }
    try {
      const current = await readTeamClipManifest(store, env, teamId, target.mediaId);
      if (current.entries.length) {
        // Never merge old tag-based bytes into a newer active permanent clip
        // set. Keep this evidence intact until a coach deliberately resolves it.
        skipped.push(sig);
        continue;
      }
      const copied = [];
      for (const entry of legacy.entries || []) copied.push(await copyLegacyEntry(bucket, teamId, entry));
      if (!copied.length) {
        await writeTeamClipManifest(store, teamId, sig, []);
        retired.push(sig);
        continue;
      }
      await writeTeamClipManifest(store, teamId, target.mediaId, copied);
      await writeTeamClipManifest(store, teamId, sig, []);
      migrated.push({ sig, mediaId: target.mediaId });
    } catch (_err) {
      failed.push(sig);
    }
  }
  // Only an active conflicting fallback or an operation failure remains
  // actionable. Historic keys behind tombstones are deliberately retained and
  // must not keep the migration in a retry loop.
  const remaining = skipped.length + failed.length;
  return {
    migrated,
    retired,
    inactive: inactive.length,
    skipped,
    failed,
    remaining,
    complete: remaining === 0,
  };
}

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!isAdmin(session)) return authJson({ ok: false, error: "Admin access is required." }, { status: 403 });
  const teamId = await resolveSessionTeamId(session, context.env);
  const primaryTeamId = await getPrimaryTeamId(context.env);
  if (!teamId || teamId !== primaryTeamId) {
    return authJson({ ok: false, error: "Legacy play-clip migration is only available to the configured primary team." }, { status: 403 });
  }
  const store = context.env?.SYNC_KV;
  const bucket = context.env?.CLIPS;
  if (!store || !bucket || !context.env?.DB) return authJson({ ok: false, error: "Cloud media storage is not configured." }, { status: 503 });
  try {
    return authJson({ ok: true, ...(await migrateLegacyPlayManifests(store, bucket, context.env, teamId)) });
  } catch (_err) {
    return authJson({ ok: false, error: "Legacy play-clip migration could not be completed." }, { status: 502 });
  }
}
