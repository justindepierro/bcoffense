// Admin-only, explicit repair for a canonical diagram that was mapped to the
// wrong archived object by an earlier migration. The old version stays in R2;
// this creates a new immutable version and atomically repoints its manifest.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import {
  detectImageContentType,
  imageVersionedR2Key,
  normalizeImageContentType,
  readImageManifest,
  sha256Hex,
  writeImageManifest,
} from "../_lib/image-media.js";
import { normalizeLegacyDiagramSourceKey } from "../_lib/legacy-image-source.js";
import { isPrimaryTeam, resolveSessionTeamId } from "../_lib/team-context.js";

const MAX_MEDIA_ID_LENGTH = 512;
const MAX_LEGACY_KEY_LENGTH = 1000;

function clean(value, max) { return String(value || "").trim().slice(0, max); }

function requestedSourceKey(body) {
  const hasSourceKey = body && Object.prototype.hasOwnProperty.call(body, "sourceKey");
  return normalizeLegacyDiagramSourceKey(hasSourceKey ? body.sourceKey : body?.legacyKey, MAX_LEGACY_KEY_LENGTH);
}

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson({ ok: false, error: "Only an admin may repair a diagram mapping." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) return authJson({ ok: false, error: "Team access is not configured." }, { status: 503 });
  if (!(await isPrimaryTeam(context.env, teamId))) {
    return authJson({ ok: false, error: "Archived diagram recovery is available only to the configured primary team." }, { status: 403 });
  }
  const bucket = context.env?.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });

  let body = null;
  try { body = await context.request.json(); } catch (_err) { body = null; }
  const mediaId = clean(body?.mediaId, MAX_MEDIA_ID_LENGTH);
  const sourceKey = requestedSourceKey(body);
  const expectedCurrentChecksum = clean(body?.expectedCurrentChecksum, 128).toLowerCase();
  const expectedLegacyChecksum = clean(body?.expectedLegacyChecksum, 128).toLowerCase();
  if (!mediaId || !sourceKey || !/^[a-f0-9]{64}$/.test(expectedCurrentChecksum) || !/^[a-f0-9]{64}$/.test(expectedLegacyChecksum)) {
    return authJson({ ok: false, error: "A media ID, full archived source key, and both verified checksums are required." }, { status: 400 });
  }

  try {
    const current = await readImageManifest(context.env, teamId, mediaId);
    if (!current || current.checksum !== expectedCurrentChecksum) {
      return authJson({ ok: false, error: "The canonical diagram changed; rerun reconciliation before repairing." }, { status: 409 });
    }
    const source = await bucket.get(sourceKey);
    if (!source?.body) return authJson({ ok: false, error: "The archived diagram was not found." }, { status: 404 });
    const bytes = await source.arrayBuffer();
    const checksum = await sha256Hex(bytes);
    if (checksum !== expectedLegacyChecksum) {
      return authJson({ ok: false, error: "The archived diagram changed; rerun reconciliation before repairing." }, { status: 409 });
    }
    const contentType = detectImageContentType(bytes);
    const declaredContentType = normalizeImageContentType(source.httpMetadata?.contentType);
    if (!contentType || (declaredContentType && declaredContentType !== contentType)) {
      return authJson({ ok: false, error: "The archived object is not a safe supported image." }, { status: 415 });
    }
    const version = crypto.randomUUID();
    const uploadedAt = new Date().toISOString();
    const r2key = imageVersionedR2Key(teamId, mediaId, version);
    const saved = await bucket.put(r2key, bytes, {
      httpMetadata: { contentType },
      customMetadata: { teamId, mediaId, version, checksum, repairedFrom: sourceKey },
    });
    const commit = await writeImageManifest(context.env, teamId, mediaId, {
      version,
      r2key,
      size: saved?.size || bytes.byteLength,
      contentType,
      checksum,
      uploadedAt,
      uploadedBy: `${session.username}:legacy-repair`,
    }, { expectedVersion: current.version });
    if (!commit.committed) {
      return authJson({ ok: false, error: "The canonical diagram changed; rerun reconciliation before repairing." }, { status: 409 });
    }
    return authJson({ ok: true, mediaId, version, size: saved?.size || bytes.byteLength, sourceKey, repairedFrom: sourceKey });
  } catch (_err) {
    return authJson({ ok: false, error: "Diagram mapping could not be repaired." }, { status: 502 });
  }
}
