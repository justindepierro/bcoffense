// Admin-only archived-diagram duplicate analysis. This route is intentionally
// read-only: it hashes exact legacy R2 objects, compares them with canonical
// D1 diagram checksums, and returns groups for review. It never promotes,
// rewrites, or deletes a media object.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { detectImageContentType, sha256Hex } from "../_lib/image-media.js";
import { normalizeLegacyDiagramSourceKey } from "../_lib/legacy-image-source.js";
import { isPrimaryTeam, resolveSessionTeamId } from "../_lib/team-context.js";

const LEGACY_PREFIXES = ["media/plays/", "images/"];
const PAGE_SIZE = 1000;
const MAX_OBJECTS = 500;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const HASH_CONCURRENCY = 4;

async function listLegacyObjects(bucket) {
  const objects = [];
  const seen = new Set();
  let truncated = false;
  for (const prefix of LEGACY_PREFIXES) {
    let cursor = undefined;
    do {
      const page = await bucket.list({ prefix, cursor, limit: PAGE_SIZE });
      for (const object of page?.objects || []) {
        const sourceKey = normalizeLegacyDiagramSourceKey(object?.key);
        if (!sourceKey || seen.has(sourceKey)) continue;
        seen.add(sourceKey);
        objects.push({
          sourceKey,
          size: Math.max(0, Number(object?.size || 0)),
          uploadedAt: object?.uploaded ? new Date(object.uploaded).toISOString() : "",
        });
        if (objects.length >= MAX_OBJECTS) {
          truncated = true;
          return { objects, truncated };
        }
      }
      cursor = page?.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  return { objects, truncated };
}

async function canonicalChecksumOwners(db, teamId) {
  const result = await db.prepare(
    "SELECT media_id, checksum FROM team_media_manifests WHERE team_id = ? AND kind = 'diagram' AND checksum <> ''",
  ).bind(teamId).all();
  const owners = new Map();
  for (const row of result?.results || []) {
    const checksum = String(row?.checksum || "").trim().toLowerCase();
    const mediaId = String(row?.media_id || "").trim();
    if (!checksum || !mediaId) continue;
    const ids = owners.get(checksum) || [];
    ids.push(mediaId);
    owners.set(checksum, ids);
  }
  return owners;
}

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson({ ok: false, error: "Only an admin may analyze archived diagrams." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId || !(await isPrimaryTeam(context.env, teamId))) {
    return authJson({ ok: false, error: "Archived diagram analysis is available only to the configured primary team." }, { status: 403 });
  }
  const bucket = context.env?.CLIPS;
  const db = context.env?.DB;
  if (!bucket || !db) return authJson({ ok: false, error: "Diagram storage is not configured." }, { status: 503 });

  try {
    const [{ objects, truncated }, ownersByChecksum] = await Promise.all([
      listLegacyObjects(bucket),
      canonicalChecksumOwners(db, teamId),
    ]);
    const entries = [];
    let cursor = 0;
    async function worker() {
      while (cursor < objects.length) {
        const object = objects[cursor];
        cursor += 1;
        if (object.size > MAX_IMAGE_BYTES) {
          entries.push({ ...object, status: "too-large" });
          continue;
        }
        try {
          const source = await bucket.get(object.sourceKey);
          if (!source?.body) {
            entries.push({ ...object, status: "missing" });
            continue;
          }
          const bytes = await source.arrayBuffer();
          if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
            entries.push({ ...object, status: "too-large" });
            continue;
          }
          const contentType = detectImageContentType(bytes);
          if (!contentType) {
            entries.push({ ...object, status: "unsupported" });
            continue;
          }
          const checksum = await sha256Hex(bytes);
          entries.push({
            ...object,
            checksum,
            contentType,
            status: "ready",
            canonicalMediaIds: ownersByChecksum.get(checksum) || [],
          });
        } catch (_err) {
          entries.push({ ...object, status: "unreadable" });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(HASH_CONCURRENCY, Math.max(1, objects.length)) }, worker));

    const groupsByChecksum = new Map();
    entries.filter((entry) => entry.status === "ready").forEach((entry) => {
      const group = groupsByChecksum.get(entry.checksum) || {
        checksum: entry.checksum,
        canonicalMediaIds: entry.canonicalMediaIds,
        sources: [],
      };
      group.sources.push({ sourceKey: entry.sourceKey, size: entry.size, uploadedAt: entry.uploadedAt });
      groupsByChecksum.set(entry.checksum, group);
    });
    const groups = [...groupsByChecksum.values()]
      .map((group) => ({
        ...group,
        sources: group.sources.sort((a, b) => (Date.parse(b.uploadedAt || "") || 0) - (Date.parse(a.uploadedAt || "") || 0) || a.sourceKey.localeCompare(b.sourceKey)),
      }))
      .sort((a, b) => Number(Boolean(b.canonicalMediaIds.length)) - Number(Boolean(a.canonicalMediaIds.length)) || b.sources.length - a.sources.length || a.checksum.localeCompare(b.checksum));
    const counts = {
      scanned: entries.length,
      ready: entries.filter((entry) => entry.status === "ready").length,
      alreadyCanonical: groups.filter((group) => group.canonicalMediaIds.length).reduce((sum, group) => sum + group.sources.length, 0),
      duplicateArchiveCopies: groups.filter((group) => group.sources.length > 1).reduce((sum, group) => sum + group.sources.length - 1, 0),
      unsupported: entries.filter((entry) => entry.status !== "ready").length,
      uniqueGroups: groups.length,
    };
    return authJson({ ok: true, generatedAt: new Date().toISOString(), truncated, groups, counts });
  } catch (_err) {
    return authJson({ ok: false, error: "Archived diagram duplicate analysis could not be completed." }, { status: 502 });
  }
}
