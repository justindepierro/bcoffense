// GET /images/manifest?sig=<mediaId> — metadata for the current diagram.

import { authJson } from "../_lib/auth.js";
import { publicImageManifest, resolveImageManifest } from "../_lib/image-media.js";
import { getMediaAccess } from "../_lib/media-access.js";

const MAX_SIG_LENGTH = 512;

export async function onRequestGet(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  const sig = (new URL(context.request.url).searchParams.get("sig") || "").trim();
  if (!sig || sig.length > MAX_SIG_LENGTH) {
    return authJson({ ok: false, error: "A valid play media ID is required." }, { status: 400 });
  }
  const access = await getMediaAccess(context.request, context.env, "diagram", sig);
  if (!access.ok) return authJson({ ok: false, error: access.error }, { status: access.status });
  try {
    const resolved = await resolveImageManifest(context.env, bucket, access.teamId, sig);
    return authJson(publicImageManifest(sig, resolved.manifest, { legacy: resolved.legacy }));
  } catch (_err) {
    return authJson({ ok: false, error: "Image manifest could not be read." }, { status: 502 });
  }
}
