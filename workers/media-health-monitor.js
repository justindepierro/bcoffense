// Hourly server-side media health monitor. It never repairs or deletes media;
// it records the exact state so staff only see actionable discrepancies.

import { getPrimaryTeamId, teamClipManifestPrefix } from "../functions/_lib/team-context.js";
import { readTeamClipManifest } from "../functions/_lib/team-workspace.js";

const MAX_OBJECTS = 5000;
const R2_PAGE_SIZE = 1000;
const KV_PAGE_SIZE = 1000;
const LEGACY_CLIP_MANIFEST_PREFIX = "clips:";
const LEGACY_CLIP_PREFIX = "clips/";
const LEGACY_DIAGRAM_PREFIXES = ["media/plays/", "images/"];
const STUCK_UPLOAD_SECONDS = 15 * 60;
const CANONICAL_ORPHAN_RETENTION_SECONDS = 7 * 24 * 60 * 60;

function teamPrefix(teamId) {
  return `media/teams/${encodeURIComponent(String(teamId || "").trim())}/`;
}

function decodeComponent(value) {
  try { return decodeURIComponent(value); } catch (_err) { return ""; }
}

function legacyDiagramKind(key) {
  const value = String(key || "");
  if (value.startsWith("media/plays/") || value.startsWith("images/play:")) return "legacy-canonical-key";
  if (value.startsWith("images/") && value.slice("images/".length).includes("|")) return "legacy-content";
  return "legacy-signature";
}

async function listR2(bucket, prefixes) {
  const objects = [];
  let truncated = false;
  for (const prefix of prefixes) {
    let cursor;
    do {
      const remaining = MAX_OBJECTS - objects.length;
      if (remaining <= 0) return { objects, truncated: true };
      const page = await bucket.list({
        prefix,
        cursor,
        limit: Math.min(R2_PAGE_SIZE, remaining),
        include: ["customMetadata"],
      });
      objects.push(...(page.objects || []));
      cursor = page.truncated ? page.cursor : undefined;
      if (page.truncated && !cursor) truncated = true;
    } while (cursor && objects.length < MAX_OBJECTS);
  }
  return { objects, truncated: truncated || objects.length >= MAX_OBJECTS };
}

async function listManifestSigs(store, teamId, includeLegacy) {
  const values = [];
  let truncated = false;
  const prefixes = [
    { value: teamClipManifestPrefix(teamId), encoded: true },
    ...(includeLegacy ? [{ value: LEGACY_CLIP_MANIFEST_PREFIX, encoded: false }] : []),
  ];
  for (const prefix of prefixes) {
    let cursor;
    do {
      const remaining = MAX_OBJECTS - values.length;
      if (remaining <= 0) return { sigs: [...new Set(values)], truncated: true };
      const page = await store.list({ prefix: prefix.value, cursor, limit: Math.min(KV_PAGE_SIZE, remaining) });
      (page.keys || []).forEach((key) => {
        const raw = String(key?.name || "").slice(prefix.value.length);
        const sig = prefix.encoded ? decodeComponent(raw) : raw;
        if (sig) values.push(sig);
      });
      cursor = page.list_complete === false ? page.cursor : undefined;
      if (page.list_complete === false && !cursor) truncated = true;
    } while (cursor && values.length < MAX_OBJECTS);
  }
  return { sigs: [...new Set(values)], truncated };
}

async function readClipManifestHealth(store, env, teamId, sigs) {
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < sigs.length) {
      const sig = sigs[cursor++];
      const resolved = await readTeamClipManifest(store, env, teamId, sig);
      const entries = Array.isArray(resolved.entries) ? resolved.entries : [];
      if (entries.length) rows.push({ sig, legacy: Boolean(resolved.legacy), entries });
    }
  }
  await Promise.all(Array.from({ length: Math.min(12, Math.max(1, sigs.length)) }, worker));
  return rows;
}

async function syncCanonicalOrphanCandidates(db, teamId, keys, scannedAt, scanComplete) {
  // A partial R2 listing can never prove that a key is orphaned or restored.
  // Leave the ledger untouched until a complete scan is available.
  if (!scanComplete) return { pendingCount: 0, eligibleCount: 0, tracked: false };
  const uniqueKeys = [...new Set(keys.map((key) => String(key || "")).filter(Boolean))];
  for (const r2Key of uniqueKeys) {
    await db.prepare(
      `INSERT INTO media_cleanup_candidates (team_id, r2_key, first_seen_at, last_seen_at, scan_count, status)
       VALUES (?, ?, ?, ?, 1, 'pending')
       ON CONFLICT(team_id, r2_key) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         scan_count = media_cleanup_candidates.scan_count + 1,
         status = 'pending'`,
    ).bind(teamId, r2Key, scannedAt, scannedAt).run();
  }
  // If a future scan finds the key referenced again, it is no longer a
  // deletion candidate. Preserve the record as audit history, never erase it.
  await db.prepare(
    `UPDATE media_cleanup_candidates
       SET status = 'resolved'
       WHERE team_id = ? AND status = 'pending' AND last_seen_at < ?`,
  ).bind(teamId, scannedAt).run();
  const counts = await db.prepare(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN status = 'pending' AND first_seen_at <= ? THEN 1 ELSE 0 END) AS eligible_count
       FROM media_cleanup_candidates WHERE team_id = ?`,
  ).bind(scannedAt - CANONICAL_ORPHAN_RETENTION_SECONDS, teamId).first();
  return {
    pendingCount: Number(counts?.pending_count || 0) || 0,
    eligibleCount: Number(counts?.eligible_count || 0) || 0,
    tracked: true,
  };
}

async function runTeamHealth(env, teamId, includeLegacy) {
  const startedAt = Math.floor(Date.now() / 1000);
  const diagramPrefix = `${teamPrefix(teamId)}plays/`;
  const clipPrefix = `${teamPrefix(teamId)}clips/`;
  const [pointers, diagramList, legacyDiagramList, clipList, manifestList, release, pendingUploads, stuckUploads] = await Promise.all([
    env.DB.prepare("SELECT media_id, r2_key, checksum FROM team_media_manifests WHERE team_id = ? AND kind = 'diagram'").bind(teamId).all(),
    listR2(env.CLIPS, [diagramPrefix]),
    includeLegacy ? listR2(env.CLIPS, LEGACY_DIAGRAM_PREFIXES) : Promise.resolve({ objects: [], truncated: false }),
    listR2(env.CLIPS, [clipPrefix, ...(includeLegacy ? [LEGACY_CLIP_PREFIX] : [])]),
    listManifestSigs(env.SYNC_KV, teamId, includeLegacy),
    env.DB.prepare("SELECT updated_at FROM team_player_release_current WHERE team_id = ? LIMIT 1").bind(teamId).first(),
    env.DB.prepare(
      "SELECT id, kind, target_key, state, attempts, queued_at, updated_at, last_error FROM team_media_upload_receipts WHERE team_id = ? AND state != 'completed' ORDER BY updated_at ASC LIMIT 100",
    ).bind(teamId).all(),
    env.DB.prepare(
      "SELECT id, kind, target_key, state, attempts, queued_at, updated_at, last_error FROM team_media_upload_receipts WHERE team_id = ? AND (state = 'blocked' OR (state = 'retrying' AND updated_at <= ?)) ORDER BY updated_at ASC LIMIT 100",
    ).bind(teamId, startedAt - STUCK_UPLOAD_SECONDS).all(),
  ]);
  const clipManifests = await readClipManifestHealth(env.SYNC_KV, env, teamId, manifestList.sigs);
  const diagramObjectByKey = new Map((diagramList.objects || []).map((object) => [String(object.key || ""), object]));
  const pointerKeys = new Set((pointers.results || []).map((row) => String(row.r2_key || "")).filter(Boolean));
  const orphanCanonicalDiagramKeys = [...diagramObjectByKey.keys()].filter((key) => !pointerKeys.has(key));
  const legacyDiagramCounts = (legacyDiagramList.objects || []).reduce((counts, object) => {
    const kind = legacyDiagramKind(object?.key);
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, { "legacy-canonical-key": 0, "legacy-content": 0, "legacy-signature": 0 });
  const clipObjectKeys = new Set((clipList.objects || []).map((object) => String(object.key || "")));
  const rows = pointers.results || [];
  const missing = [];
  const invalid = [];
  const checksumMismatch = [];
  rows.forEach((row) => {
    const key = String(row.r2_key || "");
    const object = diagramObjectByKey.get(key);
    if (!object) {
      if (!diagramList.truncated) missing.push(String(row.media_id || ""));
      return;
    }
    if (!key.startsWith(diagramPrefix) || !key.includes("/diagram/")) invalid.push(String(row.media_id || ""));
    const objectChecksum = String(object.customMetadata?.checksum || "").toLowerCase();
    if (objectChecksum && objectChecksum !== String(row.checksum || "").toLowerCase()) checksumMismatch.push(String(row.media_id || ""));
  });
  const missingClips = [];
  let clipCount = 0;
  clipManifests.forEach((manifest) => {
    manifest.entries.forEach((entry) => {
      const id = String(entry?.id || "");
      const key = String(entry?.r2key || (id ? `${LEGACY_CLIP_PREFIX}${id}` : ""));
      if (!id || !key) return;
      clipCount += 1;
      if (!clipObjectKeys.has(key) && !clipList.truncated) missingClips.push(`${manifest.sig}:${id}`);
    });
  });
  const releaseAgeSeconds = release?.updated_at ? Math.max(0, startedAt - Number(release.updated_at)) : -1;
  const pendingReceiptRows = pendingUploads.results || [];
  const stuckReceiptRows = stuckUploads.results || [];
  const scanComplete = !diagramList.truncated && !legacyDiagramList.truncated && !clipList.truncated && !manifestList.truncated;
  const orphanRetention = await syncCanonicalOrphanCandidates(
    env.DB,
    teamId,
    orphanCanonicalDiagramKeys,
    startedAt,
    scanComplete,
  );
  const hasMediaIssue = missing.length || invalid.length || checksumMismatch.length || missingClips.length;
  const status = hasMediaIssue || stuckReceiptRows.length
    ? "attention"
    : pendingReceiptRows.length
      ? "waiting"
      : "healthy";
  const completedAt = Math.floor(Date.now() / 1000);
  const detail = {
    scanComplete,
    missingMediaIds: missing.slice(0, 25),
    invalidMediaIds: invalid.slice(0, 25),
    checksumMismatchMediaIds: checksumMismatch.slice(0, 25),
    missingClipIds: missingClips.slice(0, 25),
    canonicalDiagramObjectCount: diagramObjectByKey.size,
    orphanCanonicalDiagramCount: orphanCanonicalDiagramKeys.length,
    orphanCanonicalDiagramKeys: orphanCanonicalDiagramKeys.slice(0, 25),
    orphanRetention: {
      retentionDays: CANONICAL_ORPHAN_RETENTION_SECONDS / (24 * 60 * 60),
      ...orphanRetention,
    },
    legacyDiagramObjectCounts: legacyDiagramCounts,
    clipCount,
    // A queued receipt is not automatically a failure: it may be a phone
    // safely offline with its original bytes retained in IndexedDB. Only a
    // blocked or stale retrying receipt is promoted to attention above.
    pendingUploads: pendingReceiptRows.slice(0, 12).map((row) => ({
      id: String(row.id || ""), kind: String(row.kind || ""), target: String(row.target_key || ""),
      state: String(row.state || ""), attempts: Number(row.attempts || 0) || 0,
      queuedAt: Number(row.queued_at || 0) || 0, updatedAt: Number(row.updated_at || 0) || 0,
    })),
    stuckUploads: stuckReceiptRows.slice(0, 12).map((row) => ({
      id: String(row.id || ""), kind: String(row.kind || ""), target: String(row.target_key || ""),
      state: String(row.state || ""), attempts: Number(row.attempts || 0) || 0,
      queuedAt: Number(row.queued_at || 0) || 0, updatedAt: Number(row.updated_at || 0) || 0,
    })),
  };
  await env.DB.prepare(
    `INSERT INTO media_health_runs
      (id, team_id, status, started_at, completed_at, diagram_pointer_count, diagram_object_count,
       missing_diagram_count, invalid_diagram_path_count, checksum_mismatch_count, clip_manifest_count,
       missing_clip_count, legacy_clip_manifest_count, release_age_seconds, pending_upload_count,
       stuck_upload_count, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), teamId, status, startedAt, completedAt, rows.length, diagramObjectByKey.size,
    missing.length, invalid.length, checksumMismatch.length, clipManifests.length, missingClips.length,
    clipManifests.filter((manifest) => manifest.legacy).length, releaseAgeSeconds,
    pendingReceiptRows.length, stuckReceiptRows.length, JSON.stringify(detail),
  ).run();
  return {
    teamId, status, pointers: rows.length, diagrams: diagramObjectByKey.size, clips: clipCount,
    pendingUploads: pendingReceiptRows.length, stuckUploads: stuckReceiptRows.length,
  };
}

async function runHealth(env) {
  if (!env?.DB || !env?.CLIPS || !env?.SYNC_KV) throw new Error("Media health bindings are not configured.");
  const [teams, primaryTeamId] = await Promise.all([
    env.DB.prepare("SELECT id FROM teams LIMIT 100").all(),
    getPrimaryTeamId(env),
  ]);
  const results = [];
  for (const team of teams.results || []) {
    const teamId = String(team.id || "");
    if (teamId) results.push(await runTeamHealth(env, teamId, teamId === primaryTeamId));
  }
  return results;
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runHealth(env));
  },
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
