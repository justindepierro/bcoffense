// Admin-only preview for one exact archived diagram. This route never creates
// a manifest or alters R2; it lets an administrator visually verify a mapping
// before the checksum-gated migration endpoint copies the bytes.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { detectImageContentType, sha256Hex } from "../_lib/image-media.js";
import { normalizeLegacyDiagramSourceKey } from "../_lib/legacy-image-source.js";
import { isPrimaryTeam, resolveSessionTeamId } from "../_lib/team-context.js";

const MAX_SOURCE_KEY_LENGTH = 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson({ ok: false, error: "Only an admin may preview archived diagrams." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId || !(await isPrimaryTeam(context.env, teamId))) {
    return authJson({ ok: false, error: "Archived diagram recovery is available only to the configured primary team." }, { status: 403 });
  }
  const sourceKey = normalizeLegacyDiagramSourceKey(
    new URL(context.request.url).searchParams.get("sourceKey"),
    MAX_SOURCE_KEY_LENGTH,
  );
  if (!sourceKey) return authJson({ ok: false, error: "An exact archived diagram key is required." }, { status: 400 });
  const bucket = context.env?.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });

  try {
    const object = await bucket.get(sourceKey);
    if (!object?.body) return new Response(null, { status: 404 });
    if (Number(object.size || 0) > MAX_IMAGE_BYTES) {
      return authJson({ ok: false, error: "Archived diagram exceeds the 8 MB recovery preview limit." }, { status: 413 });
    }
    const bytes = await object.arrayBuffer();
    if (!bytes.byteLength) return new Response(null, { status: 404 });
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return authJson({ ok: false, error: "Archived diagram exceeds the 8 MB recovery preview limit." }, { status: 413 });
    }
    const contentType = detectImageContentType(bytes);
    if (!contentType) return authJson({ ok: false, error: "Archived object is not a supported diagram image." }, { status: 415 });
    const checksum = await sha256Hex(bytes);
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "Vary": "Cookie",
        "X-BC-Legacy-Checksum": checksum,
        "X-BC-Legacy-Source": sourceKey,
      },
    });
  } catch (_err) {
    return authJson({ ok: false, error: "Archived diagram preview could not be loaded." }, { status: 502 });
  }
}
