// functions/media/inventory.js — Staff-only complete Cloudflare media inventory.
//
// Inventory is deliberately team-scoped. The historic, globally named R2/KV
// records are shown only to the one explicitly configured primary team, where
// they are recovery evidence. They must never become a cross-team listing.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { normalizeLegacyDiagramSourceKey } from "../_lib/legacy-image-source.js";
import {
  getPrimaryTeamId,
  resolveSessionTeamId,
  teamClipManifestPrefix,
} from "../_lib/team-context.js";
import { readTeamClipManifest } from "../_lib/team-workspace.js";

const R2_PAGE_SIZE = 1000;
const KV_PAGE_SIZE = 1000;
const MAX_OBJECTS = 5000;
const MAX_MANIFESTS = 5000;
const MANIFEST_READ_CONCURRENCY = 12;

// Pre-team media paths are recovery-only. Do not add them to a non-primary
// team's scan: those object names have no tenant boundary.
const LEGACY_DIAGRAM_PREFIXES = ["media/plays/", "images/"];
const LEGACY_CLIP_PREFIX = "clips/";
const LEGACY_CLIP_MANIFEST_PREFIX = "clips:";

function isStaff(session) {
  return session && (session.role === "admin" || session.role === "coach");
}

function teamMediaPrefix(teamId) {
  return `media/teams/${encodeURIComponent(String(teamId || "").trim())}/`;
}

function teamDiagramPrefix(teamId) {
  return `${teamMediaPrefix(teamId)}plays/`;
}

function teamClipPrefix(teamId) {
  return `${teamMediaPrefix(teamId)}clips/`;
}

function decodeComponent(value) {
  try { return decodeURIComponent(value); } catch (_err) { return ""; }
}

async function canInspectLegacyForTeam(env, teamId) {
  const primaryTeamId = await getPrimaryTeamId(env);
  return Boolean(primaryTeamId && String(primaryTeamId) === String(teamId));
}

function classifyDiagramKey(key, canonicalPrefix) {
  const value = String(key || "");
  if (value.startsWith(canonicalPrefix)) return "canonical";
  if (value.startsWith("media/plays/")) return "legacy-canonical-key";
  const sig = value.slice("images/".length);
  if (sig.startsWith("play:")) return "legacy-canonical-key";
  if (sig.includes("|")) return "legacy-content";
  return "legacy-signature";
}

function mediaIdForDiagramKey(key, canonicalPrefix) {
  const value = String(key || "");
  if (!value.startsWith(canonicalPrefix)) return "";
  const [encodedMediaId, kind] = value.slice(canonicalPrefix.length).split("/");
  if (!encodedMediaId || kind !== "diagram") return "";
  return decodeComponent(encodedMediaId) || encodedMediaId;
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
        include: ["httpMetadata", "customMetadata"],
      });
      objects.push(...(Array.isArray(page.objects) ? page.objects : []));
      cursor = page.truncated ? page.cursor : undefined;
      if (page.truncated && !cursor) truncated = true;
    } while (cursor && objects.length < MAX_OBJECTS);
    if (objects.length >= MAX_OBJECTS) return { objects, truncated: true };
  }
  return { objects, truncated };
}

async function listManifestSigs(store, teamId, includeLegacy) {
  const candidates = [];
  const prefixes = [
    { prefix: teamClipManifestPrefix(teamId), encoded: true },
    ...(includeLegacy ? [{ prefix: LEGACY_CLIP_MANIFEST_PREFIX, encoded: false }] : []),
  ];
  let truncated = false;

  for (const { prefix, encoded } of prefixes) {
    let cursor;
    do {
      const remaining = MAX_MANIFESTS - candidates.length;
      if (remaining <= 0) return { sigs: [...new Set(candidates)], truncated: true };
      const page = await store.list({ prefix, cursor, limit: Math.min(KV_PAGE_SIZE, remaining) });
      (page.keys || []).forEach((key) => {
        const raw = String(key?.name || "").slice(prefix.length);
        const sig = encoded ? decodeComponent(raw) : raw;
        if (sig) candidates.push(sig);
      });
      cursor = page.list_complete === false ? page.cursor : undefined;
      if (page.list_complete === false && !cursor) truncated = true;
    } while (cursor && candidates.length < MAX_MANIFESTS);
    if (candidates.length >= MAX_MANIFESTS) return { sigs: [...new Set(candidates)], truncated: true };
  }

  return { sigs: [...new Set(candidates)], truncated };
}

async function readManifests(store, env, teamId, sigs) {
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < sigs.length) {
      const sig = sigs[cursor++];
      const resolved = await readTeamClipManifest(store, env, teamId, sig);
      const entries = Array.isArray(resolved.entries) ? resolved.entries : [];
      if (!entries.length) continue;
      rows.push({
        sig,
        kind: sig.startsWith("signals/") ? "signal" : "play",
        legacy: Boolean(resolved.legacy),
        clips: entries.map((entry) => ({
          id: String(entry?.id || ""),
          objectKey: String(entry?.r2key || (entry?.id ? `${LEGACY_CLIP_PREFIX}${entry.id}` : "")),
          size: Number(entry?.size || 0),
          contentType: String(entry?.contentType || "video/mp4"),
          uploadedAt: String(entry?.uploadedAt || ""),
        })).filter((entry) => entry.id && entry.objectKey),
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(MANIFEST_READ_CONCURRENCY, Math.max(1, sigs.length)) }, worker));
  return rows.sort((a, b) => a.sig.localeCompare(b.sig));
}

function publicManifest(row) {
  return {
    sig: row.sig,
    kind: row.kind,
    legacy: row.legacy,
    clips: row.clips.map(({ objectKey: _objectKey, ...clip }) => clip),
  };
}

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!isStaff(session)) {
    return authJson({ ok: false, error: "Only coaches may inspect cloud media inventory." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) {
    return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
  }

  const bucket = context.env?.CLIPS;
  const store = context.env?.SYNC_KV;
  if (!bucket || !store) return authJson({ ok: false, error: "Cloud media storage is not configured." }, { status: 503 });

  try {
    const includeLegacy = await canInspectLegacyForTeam(context.env, teamId);
    const diagramPrefix = teamDiagramPrefix(teamId);
    const clipPrefix = teamClipPrefix(teamId);
    const [diagramList, clipList, manifestList] = await Promise.all([
      listR2(bucket, [diagramPrefix, ...(includeLegacy ? LEGACY_DIAGRAM_PREFIXES : [])]),
      listR2(bucket, [clipPrefix, ...(includeLegacy ? [LEGACY_CLIP_PREFIX] : [])]),
      listManifestSigs(store, teamId, includeLegacy),
    ]);
    const manifests = await readManifests(store, context.env, teamId, manifestList.sigs);
    const diagrams = diagramList.objects.map((object) => {
      const key = String(object.key || "");
      const kind = classifyDiagramKey(key, diagramPrefix);
      return {
        key,
        // Keep the original full R2 key available for checksum-gated recovery.
        // Invalid historic-looking keys may be inventoried but cannot be sent
        // to a recovery endpoint.
        sourceKey: kind === "canonical" ? "" : normalizeLegacyDiagramSourceKey(key),
        kind,
        mediaId: mediaIdForDiagramKey(key, diagramPrefix),
        size: Number(object.size || 0),
        contentType: object.httpMetadata?.contentType || "image/jpeg",
        uploadedAt: object.uploaded ? new Date(object.uploaded).toISOString() : "",
      };
    });
    const diagramCounts = diagrams.reduce((counts, item) => {
      counts.total += 1;
      counts.totalBytes += item.size;
      counts[item.kind] = (counts[item.kind] || 0) + 1;
      return counts;
    }, { total: 0, totalBytes: 0, canonical: 0, "legacy-canonical-key": 0, "legacy-content": 0, "legacy-signature": 0 });
    const referencedClipKeys = new Set(manifests.flatMap((row) => row.clips.map((clip) => clip.objectKey)));
    const clipObjects = clipList.objects.map((object) => ({
      key: String(object.key || ""),
      size: Number(object.size || 0),
    }));
    const clipCount = manifests.reduce((total, row) => total + row.clips.length, 0);
    return authJson({
      ok: true,
      generatedAt: new Date().toISOString(),
      scope: { legacyIncluded: includeLegacy },
      diagrams: {
        objects: diagrams,
        counts: diagramCounts,
        truncated: diagramList.truncated,
      },
      clips: {
        manifests: manifests.map(publicManifest),
        manifestCount: manifests.length,
        clipCount,
        playClipCount: manifests.filter((row) => row.kind === "play").reduce((total, row) => total + row.clips.length, 0),
        signalClipCount: manifests.filter((row) => row.kind === "signal").reduce((total, row) => total + row.clips.length, 0),
        r2ObjectCount: clipObjects.length,
        orphanObjectCount: clipObjects.filter((object) => !referencedClipKeys.has(object.key)).length,
        totalBytes: clipObjects.reduce((total, object) => total + object.size, 0),
        truncated: clipList.truncated || manifestList.truncated,
      },
    });
  } catch (_err) {
    return authJson({ ok: false, error: "Cloud media inventory could not be read." }, { status: 502 });
  }
}
