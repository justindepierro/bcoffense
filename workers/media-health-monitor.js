// Hourly server-side media health monitor. It never repairs or deletes media;
// it records the exact state so staff only see actionable discrepancies.

import { getPrimaryTeamId, teamClipManifestPrefix } from "../functions/_lib/team-context.js";
import { readTeamClipManifest } from "../functions/_lib/team-workspace.js";

const MAX_OBJECTS = 5000;
const R2_PAGE_SIZE = 1000;
const KV_PAGE_SIZE = 1000;
const LEGACY_CLIP_MANIFEST_PREFIX = "clips:";
const LEGACY_CLIP_PREFIX = "clips/";

function teamPrefix(teamId) {
  return `media/teams/${encodeURIComponent(String(teamId || "").trim())}/`;
}

function decodeComponent(value) {
  try { return decodeURIComponent(value); } catch (_err) { return ""; }
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

async function runTeamHealth(env, teamId, includeLegacy) {
  const startedAt = Math.floor(Date.now() / 1000);
  const diagramPrefix = `${teamPrefix(teamId)}plays/`;
  const clipPrefix = `${teamPrefix(teamId)}clips/`;
  const [pointers, diagramList, clipList, manifestList, release] = await Promise.all([
    env.DB.prepare("SELECT media_id, r2_key, checksum FROM team_media_manifests WHERE team_id = ? AND kind = 'diagram'").bind(teamId).all(),
    listR2(env.CLIPS, [diagramPrefix]),
    listR2(env.CLIPS, [clipPrefix, ...(includeLegacy ? [LEGACY_CLIP_PREFIX] : [])]),
    listManifestSigs(env.SYNC_KV, teamId, includeLegacy),
    env.DB.prepare("SELECT updated_at FROM team_player_release_current WHERE team_id = ? LIMIT 1").bind(teamId).first(),
  ]);
  const clipManifests = await readClipManifestHealth(env.SYNC_KV, env, teamId, manifestList.sigs);
  const diagramObjectByKey = new Map((diagramList.objects || []).map((object) => [String(object.key || ""), object]));
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
  const status = missing.length || invalid.length || checksumMismatch.length || missingClips.length ? "attention" : "healthy";
  const completedAt = Math.floor(Date.now() / 1000);
  const detail = {
    scanComplete: !diagramList.truncated && !clipList.truncated && !manifestList.truncated,
    missingMediaIds: missing.slice(0, 25),
    invalidMediaIds: invalid.slice(0, 25),
    checksumMismatchMediaIds: checksumMismatch.slice(0, 25),
    missingClipIds: missingClips.slice(0, 25),
    clipCount,
  };
  await env.DB.prepare(
    `INSERT INTO media_health_runs
      (id, team_id, status, started_at, completed_at, diagram_pointer_count, diagram_object_count,
       missing_diagram_count, invalid_diagram_path_count, checksum_mismatch_count, clip_manifest_count,
       missing_clip_count, legacy_clip_manifest_count, release_age_seconds, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), teamId, status, startedAt, completedAt, rows.length, diagramObjectByKey.size,
    missing.length, invalid.length, checksumMismatch.length, clipManifests.length, missingClips.length,
    clipManifests.filter((manifest) => manifest.legacy).length, releaseAgeSeconds, JSON.stringify(detail),
  ).run();
  return { teamId, status, pointers: rows.length, diagrams: diagramObjectByKey.size, clips: clipCount };
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
