// Team-scoped KV helpers.
//
// The first Cloudflare implementation used globally named KV records such as
// `team-backup` and `clips:<sig>`. Those names make a correct role check
// insufficient once more than one team exists. New writes always use the
// encoded team prefix below. Legacy keys are read only for the one explicitly
// configured primary team so existing single-team data can be recovered
// without ever becoming a cross-team fallback.

import {
  getPrimaryTeamId,
  teamClipManifestKey,
  teamClipManifestPrefix,
  teamWorkspaceKey,
} from "./team-context.js";

export const LEGACY_TEAM_WORKSPACE_KEY = "team-backup";
const LEGACY_CLIP_PREFIX = "clips:";

async function canReadLegacyForTeam(env, teamId) {
  const primaryTeamId = await getPrimaryTeamId(env);
  return Boolean(primaryTeamId && String(primaryTeamId) === String(teamId));
}

export async function readTeamWorkspaceRecord(store, env, teamId) {
  const canonical = await store.getWithMetadata(teamWorkspaceKey(teamId), {
    type: "json",
    cacheTtl: 60,
  });
  if (canonical?.value) return { ...canonical, legacy: false };
  if (!(await canReadLegacyForTeam(env, teamId))) return canonical || null;

  const legacy = await store.getWithMetadata(LEGACY_TEAM_WORKSPACE_KEY, {
    type: "json",
    cacheTtl: 60,
  });
  return legacy?.value ? { ...legacy, legacy: true } : (canonical || legacy || null);
}

export async function readTeamWorkspace(store, env, teamId) {
  const result = await readTeamWorkspaceRecord(store, env, teamId);
  return result?.value || null;
}

export async function writeTeamWorkspace(store, teamId, value, metadata = {}) {
  await store.put(teamWorkspaceKey(teamId), value, {
    metadata: { ...metadata, teamId: String(teamId) },
  });
}

export async function readTeamClipManifest(store, env, teamId, sig) {
  const canonical = await store.get(teamClipManifestKey(teamId, sig), { type: "json" });
  if (canonical !== null && canonical !== undefined) {
    return { entries: Array.isArray(canonical) ? canonical : [], legacy: false };
  }
  if (!(await canReadLegacyForTeam(env, teamId))) return { entries: [], legacy: false };
  const legacy = await store.get(`${LEGACY_CLIP_PREFIX}${sig}`, { type: "json" });
  return { entries: Array.isArray(legacy) ? legacy : [], legacy: Array.isArray(legacy) };
}

export async function writeTeamClipManifest(store, teamId, sig, entries) {
  const key = teamClipManifestKey(teamId, sig);
  if (!Array.isArray(entries) || !entries.length) {
    // A tombstone intentionally blocks the primary-team legacy fallback. A
    // coach who deletes the last clip must not have an archived `clips:<sig>`
    // record silently reappear to players.
    await store.put(key, JSON.stringify({ deleted: true }), {
      metadata: { teamId: String(teamId), kind: "clip-manifest", deleted: "true" },
    });
    return;
  }
  await store.put(key, JSON.stringify(entries), {
    metadata: { teamId: String(teamId), kind: "clip-manifest" },
  });
}

function decodeSig(value) {
  try { return decodeURIComponent(value); } catch (_err) { return ""; }
}

async function listPrefix(store, prefix, encoded = false) {
  const sigs = [];
  let cursor;
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await store.list({ prefix, cursor });
    (page.keys || []).forEach((key) => {
      const raw = String(key.name || "").slice(prefix.length);
      const sig = encoded ? decodeSig(raw) : raw;
      if (sig) sigs.push(sig);
    });
    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }
  return sigs;
}

export async function listTeamClipSigs(store, env, teamId) {
  const canonicalCandidates = await listPrefix(store, teamClipManifestPrefix(teamId), true);
  const canonical = [];
  for (const sig of canonicalCandidates) {
    const current = await readTeamClipManifest(store, env, teamId, sig);
    if (current.entries.length) canonical.push(sig);
  }
  if (!(await canReadLegacyForTeam(env, teamId))) return [...new Set(canonical)];

  const legacyCandidates = await listPrefix(store, LEGACY_CLIP_PREFIX, false);
  const legacy = [];
  for (const sig of legacyCandidates) {
    const current = await readTeamClipManifest(store, env, teamId, sig);
    if (current.legacy && current.entries.length) legacy.push(sig);
  }
  return [...new Set([...canonical, ...legacy])];
}
