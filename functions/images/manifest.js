// functions/images/manifest.js — Lightweight published diagram status checks.
//   GET /images/manifest?sig=<identityKey>  (any authed role including players)
//
// Returns metadata without streaming the image body so player views can show
// checking/unpublished/offline/load-error states before attempting a full load.

import { authJson } from "../_lib/auth.js";

const MAX_SIG_LENGTH = 512;

function r2Key(sig) {
  return `images/${sig}`;
}

export async function onRequestGet(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) {
    return authJson(
      { ok: false, error: "Image storage is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(context.request.url);
  const sig = (url.searchParams.get("sig") || "").trim();
  if (!sig || sig.length > MAX_SIG_LENGTH) {
    return authJson(
      { ok: false, error: "A valid play signature is required." },
      { status: 400 },
    );
  }

  const object = await bucket.head(r2Key(sig));
  if (!object) {
    return authJson({ ok: true, sig, published: false });
  }

  return authJson({
    ok: true,
    sig,
    published: true,
    size: object.size || 0,
    contentType: object.httpMetadata?.contentType || "image/jpeg",
    uploadedAt: object.uploaded ? new Date(object.uploaded).toISOString() : "",
  });
}
